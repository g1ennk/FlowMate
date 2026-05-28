package kr.io.flowmate.report.service;

import kr.io.flowmate.report.config.GeminiProperties;
import kr.io.flowmate.report.domain.ReportType;
import kr.io.flowmate.report.exception.AiServiceQuotaExceededException;
import kr.io.flowmate.report.exception.AiServiceUnavailableException;
import kr.io.flowmate.report.exception.ReportGenerationException;
import kr.io.flowmate.report.prompt.TodoFixtures;
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
import org.springframework.web.client.RestTemplate;

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
    private GeminiProperties props;
    private AiReportGenerator generator;

    @BeforeEach
    void setUp() {
        props = new GeminiProperties();
        props.setApiKey("test-key");
        props.setBaseUrl("https://generativelanguage.googleapis.com/v1beta");
        props.setModel("gemini-2.5-flash");
        generator = new AiReportGenerator(restTemplate, props);
    }

    @Test
    @DisplayName("정상 응답: 4개 필드 모두 채워서 ReportContent 반환")
    void generate_success() {
        Map<String, Object> body = candidates("{\"keep\":\"- k\",\"problem\":\"- p\",\"try\":\"- t\",\"referenceQuestion\":\"q?\"}");
        when(restTemplate.postForEntity(anyString(), any(HttpEntity.class), eq(Map.class)))
            .thenReturn(ResponseEntity.ok(body));

        var result = generator.generate(ReportType.DAILY,
            List.of(TodoFixtures.completed("JWT", 4500, 3)), null);

        assertThat(result.content().keep()).isEqualTo("- k");
        assertThat(result.content().tryAction()).isEqualTo("- t");
        assertThat(result.content().referenceQuestion()).isEqualTo("q?");
        assertThat(result.promptVersion()).isEqualTo("daily.v2");
    }

    @Test
    @DisplayName("코드블록으로 감싸진 응답도 정규식 fallback으로 파싱")
    void generate_fallback_json() {
        String wrapped = "```json\n{\"keep\":\"k\",\"problem\":\"p\",\"try\":\"t\"}\n```";
        when(restTemplate.postForEntity(anyString(), any(HttpEntity.class), eq(Map.class)))
            .thenReturn(ResponseEntity.ok(candidates(wrapped)));

        var result = generator.generate(ReportType.DAILY,
            List.of(TodoFixtures.completed("x", 60, 1)), null);

        assertThat(result.content().keep()).isEqualTo("k");
        assertThat(result.content().referenceQuestion()).isNull();
    }

    @Test
    @DisplayName("필수 필드 누락 시 ReportGenerationException")
    void generate_incomplete_fields() {
        when(restTemplate.postForEntity(anyString(), any(HttpEntity.class), eq(Map.class)))
            .thenReturn(ResponseEntity.ok(candidates("{\"keep\":\"k\"}")));

        assertThatThrownBy(() -> generator.generate(ReportType.DAILY,
            List.of(TodoFixtures.completed("x", 60, 1)), null))
            .isInstanceOf(ReportGenerationException.class)
            .hasMessageContaining("Incomplete report fields");
    }

    @Test
    @DisplayName("429 → AiServiceQuotaExceededException (한국어 메시지)")
    void generate_429() {
        when(restTemplate.postForEntity(anyString(), any(HttpEntity.class), eq(Map.class)))
            .thenThrow(HttpClientErrorException.create(HttpStatus.TOO_MANY_REQUESTS, "quota", null, null, null));

        assertThatThrownBy(() -> generator.generate(ReportType.DAILY,
            List.of(TodoFixtures.completed("x", 60, 1)), null))
            .isInstanceOf(AiServiceQuotaExceededException.class)
            .hasMessage("AI 서비스가 일시적으로 사용량이 초과되었습니다");
    }

    @Test
    @DisplayName("503 → AiServiceUnavailableException (한국어 메시지)")
    void generate_503() {
        when(restTemplate.postForEntity(anyString(), any(HttpEntity.class), eq(Map.class)))
            .thenThrow(HttpServerErrorException.create(HttpStatus.SERVICE_UNAVAILABLE, "down", null, null, null));

        assertThatThrownBy(() -> generator.generate(ReportType.DAILY,
            List.of(TodoFixtures.completed("x", 60, 1)), null))
            .isInstanceOf(AiServiceUnavailableException.class);
    }

    @Test
    @DisplayName("기타 5xx → ReportGenerationException (500)")
    void generate_other_5xx() {
        when(restTemplate.postForEntity(anyString(), any(HttpEntity.class), eq(Map.class)))
            .thenThrow(HttpServerErrorException.create(HttpStatus.BAD_GATEWAY, "x", null, null, null));

        assertThatThrownBy(() -> generator.generate(ReportType.DAILY,
            List.of(TodoFixtures.completed("x", 60, 1)), null))
            .isInstanceOf(ReportGenerationException.class);
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
