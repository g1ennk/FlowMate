package kr.io.flowmate.report.service;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import kr.io.flowmate.report.config.GeminiProperties;
import kr.io.flowmate.report.domain.ReportType;
import kr.io.flowmate.report.exception.AiServiceQuotaExceededException;
import kr.io.flowmate.report.exception.AiServiceUnavailableException;
import kr.io.flowmate.report.exception.ReportGenerationException;
import kr.io.flowmate.report.prompt.TodoFixtures;
import org.apache.hc.core5.http.ConnectionRequestTimeoutException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.HttpServerErrorException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestTemplate;

import java.net.ConnectException;
import java.net.SocketTimeoutException;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@DisplayName("AiReportGenerator")
class AiReportGeneratorTest {

    @Mock private RestTemplate restTemplate;
    private SimpleMeterRegistry meterRegistry;
    private AiReportGenerator generator;

    @BeforeEach
    void setUp() {
        GeminiProperties props = new GeminiProperties();
        props.setApiKey("test-key");
        props.setBaseUrl("https://generativelanguage.googleapis.com/v1beta");
        props.setModel("gemini-2.5-flash");
        meterRegistry = new SimpleMeterRegistry();
        generator = new AiReportGenerator(restTemplate, props, meterRegistry);
    }

    @Test
    @DisplayName("정상 응답: 4개 필드 모두 채워서 ReportContent 반환 + success 지표")
    void generate_success() {
        Map<String, Object> body = candidates("{\"keep\":\"- k\",\"problem\":\"- p\",\"try\":\"- t\",\"referenceQuestion\":\"q?\"}");
        when(restTemplate.postForEntity(anyString(), any(HttpEntity.class), eq(Map.class)))
            .thenReturn(ResponseEntity.ok(body));

        var result = generate();

        assertThat(result.content().keep()).isEqualTo("- k");
        assertThat(result.content().tryAction()).isEqualTo("- t");
        assertThat(result.content().referenceQuestion()).isEqualTo("q?");
        assertThat(result.promptVersion()).isEqualTo("daily.v2");
        assertThat(count("success", "200")).isEqualTo(1);
    }

    @Test
    @DisplayName("코드블록으로 감싸진 응답도 정규식 fallback으로 파싱")
    void generate_fallback_json() {
        String wrapped = "```json\n{\"keep\":\"k\",\"problem\":\"p\",\"try\":\"t\"}\n```";
        when(restTemplate.postForEntity(anyString(), any(HttpEntity.class), eq(Map.class)))
            .thenReturn(ResponseEntity.ok(candidates(wrapped)));

        var result = generate();

        assertThat(result.content().keep()).isEqualTo("k");
        assertThat(result.content().referenceQuestion()).isNull();
    }

    @Test
    @DisplayName("필수 필드 누락 → ReportGenerationException(500) + parse_error 지표")
    void generate_incomplete_fields() {
        when(restTemplate.postForEntity(anyString(), any(HttpEntity.class), eq(Map.class)))
            .thenReturn(ResponseEntity.ok(candidates("{\"keep\":\"k\"}")));

        assertThatThrownBy(this::generate)
            .isInstanceOf(ReportGenerationException.class)
            .hasMessageContaining("Incomplete report fields");
        assertThat(count("parse_error", "200")).isEqualTo(1);
    }

    @Test
    @DisplayName("JSON이 아닌 응답 → ReportGenerationException(500) + parse_error 지표")
    void generate_not_json() {
        when(restTemplate.postForEntity(anyString(), any(HttpEntity.class), eq(Map.class)))
            .thenReturn(ResponseEntity.ok(candidates("죄송합니다, 지금은 답할 수 없어요")));

        assertThatThrownBy(this::generate)
            .isInstanceOf(ReportGenerationException.class)
            .hasMessageContaining("Failed to parse JSON");
        assertThat(count("parse_error", "200")).isEqualTo(1);
    }

    @Test
    @DisplayName("429 → AiServiceQuotaExceededException (한국어 메시지) + quota_exceeded 지표")
    void generate_429() {
        when(restTemplate.postForEntity(anyString(), any(HttpEntity.class), eq(Map.class)))
            .thenThrow(HttpClientErrorException.create(HttpStatus.TOO_MANY_REQUESTS, "quota", null, null, null));

        assertThatThrownBy(this::generate)
            .isInstanceOf(AiServiceQuotaExceededException.class)
            .hasMessage("AI 서비스가 일시적으로 사용량이 초과되었습니다");
        assertThat(count("quota_exceeded", "429")).isEqualTo(1);
    }

    @Test
    @DisplayName("503 → AiServiceUnavailableException + server_error 지표")
    void generate_503() {
        when(restTemplate.postForEntity(anyString(), any(HttpEntity.class), eq(Map.class)))
            .thenThrow(HttpServerErrorException.create(HttpStatus.SERVICE_UNAVAILABLE, "down", null, null, null));

        assertThatThrownBy(this::generate)
            .isInstanceOf(AiServiceUnavailableException.class);
        assertThat(count("server_error", "503")).isEqualTo(1);
    }

    @Test
    @DisplayName("기타 5xx(502)도 upstream 일시 장애라 AiServiceUnavailableException(503)")
    void generate_other_5xx() {
        when(restTemplate.postForEntity(anyString(), any(HttpEntity.class), eq(Map.class)))
            .thenThrow(HttpServerErrorException.create(HttpStatus.BAD_GATEWAY, "x", null, null, null));

        assertThatThrownBy(this::generate)
            .isInstanceOf(AiServiceUnavailableException.class);
        assertThat(count("server_error", "502")).isEqualTo(1);
    }

    @Test
    @DisplayName("429 외 4xx(400, 403)는 요청이나 키 문제라 ReportGenerationException(500)")
    void generate_4xx() {
        when(restTemplate.postForEntity(anyString(), any(HttpEntity.class), eq(Map.class)))
            .thenThrow(HttpClientErrorException.create(HttpStatus.FORBIDDEN, "key", null, null, null));

        assertThatThrownBy(this::generate)
            .isInstanceOf(ReportGenerationException.class);
        assertThat(count("client_error", "403")).isEqualTo(1);
    }

    @Test
    @DisplayName("read timeout → AiServiceUnavailableException(503) + read_timeout 지표")
    void generate_read_timeout() {
        when(restTemplate.postForEntity(anyString(), any(HttpEntity.class), eq(Map.class)))
            .thenThrow(new ResourceAccessException("I/O error", new SocketTimeoutException("Read timed out")));

        assertThatThrownBy(this::generate)
            .isInstanceOf(AiServiceUnavailableException.class)
            .hasRootCauseInstanceOf(SocketTimeoutException.class);
        assertThat(count("read_timeout", "none")).isEqualTo(1);
    }

    @Test
    @DisplayName("연결 실패 → AiServiceUnavailableException(503) + connect_failed 지표")
    void generate_connect_failed() {
        when(restTemplate.postForEntity(anyString(), any(HttpEntity.class), eq(Map.class)))
            .thenThrow(new ResourceAccessException("I/O error", new ConnectException("Connection refused")));

        assertThatThrownBy(this::generate)
            .isInstanceOf(AiServiceUnavailableException.class);
        assertThat(count("connect_failed", "none")).isEqualTo(1);
    }

    @Test
    @DisplayName("connection pool 대기 초과 → AiServiceUnavailableException(503) + pool_exhausted 지표")
    void generate_pool_exhausted() {
        when(restTemplate.postForEntity(anyString(), any(HttpEntity.class), eq(Map.class)))
            .thenThrow(new ResourceAccessException("I/O error", new ConnectionRequestTimeoutException("lease")));

        assertThatThrownBy(this::generate)
            .isInstanceOf(AiServiceUnavailableException.class);
        assertThat(count("pool_exhausted", "none")).isEqualTo(1);
    }

    private AiReportGenerator.Result generate() {
        return generator.generate(ReportType.DAILY, List.of(TodoFixtures.completed("x", 60, 1)), null);
    }

    private long count(String outcome, String status) {
        var timer = meterRegistry.find(AiReportGenerator.METRIC)
            .tag("outcome", outcome).tag("status", status).timer();
        return timer == null ? 0 : timer.count();
    }

    private static Map<String, Object> candidates(String text) {
        return Map.of(
            "candidates", List.of(Map.of(
                "content", Map.of(
                    "parts", List.of(Map.of("text", text))
                )
            ))
        );
    }
}
