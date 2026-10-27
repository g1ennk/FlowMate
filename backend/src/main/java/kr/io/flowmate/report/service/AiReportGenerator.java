package kr.io.flowmate.report.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import kr.io.flowmate.report.config.GeminiProperties;
import kr.io.flowmate.report.domain.ReportContent;
import kr.io.flowmate.report.domain.ReportType;
import kr.io.flowmate.report.exception.AiServiceQuotaExceededException;
import kr.io.flowmate.report.exception.AiServiceUnavailableException;
import kr.io.flowmate.report.exception.ReportGenerationException;
import kr.io.flowmate.report.prompt.PromptTexts;
import kr.io.flowmate.report.prompt.ReportPrompts;
import kr.io.flowmate.review.domain.Review;
import kr.io.flowmate.todo.domain.Todo;
import lombok.extern.slf4j.Slf4j;
import org.apache.hc.client5.http.ConnectTimeoutException;
import org.apache.hc.core5.http.ConnectionRequestTimeoutException;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.net.ConnectException;
import java.net.NoRouteToHostException;
import java.net.SocketTimeoutException;
import java.net.UnknownHostException;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Gemini 호출 결과를 API 오류로 나눈다.
 * <ul>
 *   <li>429 → {@link AiServiceQuotaExceededException} (429 AI_QUOTA_EXCEEDED)</li>
 *   <li>5xx, timeout, 연결 실패, pool 고갈 → {@link AiServiceUnavailableException} (503 AI_SERVICE_UNAVAILABLE)</li>
 *   <li>그 밖의 4xx, 응답 파싱 실패 → {@link ReportGenerationException} (500 REPORT_GENERATION_FAILED)</li>
 * </ul>
 * 호출마다 {@code gemini.request} timer에 outcome과 status 태그를 남긴다.
 */
@Slf4j
@Component
public class AiReportGenerator {

    static final String METRIC = "gemini.request";
    private static final String NO_STATUS = "none";
    private static final Pattern JSON_OBJECT = Pattern.compile("\\{[\\s\\S]*\\}");

    private final RestTemplate restTemplate;
    private final GeminiProperties props;
    private final MeterRegistry meterRegistry;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public AiReportGenerator(@Qualifier("geminiRestTemplate") RestTemplate restTemplate,
                             GeminiProperties props,
                             MeterRegistry meterRegistry) {
        this.restTemplate = restTemplate;
        this.props = props;
        this.meterRegistry = meterRegistry;
    }

    public Result generate(ReportType type, List<Todo> todos, List<Review> weeklyReviews) {
        String prompt = switch (type) {
            case DAILY -> ReportPrompts.daily(todos);
            case WEEKLY -> ReportPrompts.weekly(todos);
            case MONTHLY -> ReportPrompts.monthly(todos, weeklyReviews);
        };
        return new Result(callGemini(prompt), type.promptVersion());
    }

    @SuppressWarnings({"rawtypes", "unchecked"})
    private ReportContent callGemini(String userPrompt) {
        String url = props.getBaseUrl() + "/models/" + props.getModel() + ":generateContent";

        Map<String, Object> body = Map.of(
            "systemInstruction", Map.of(
                "parts", List.of(Map.of("text", PromptTexts.SYSTEM_INSTRUCTION))
            ),
            "contents", List.of(Map.of(
                "parts", List.of(Map.of("text", userPrompt))
            )),
            "generationConfig", Map.of(
                "responseMimeType", "application/json"
            )
        );

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set("x-goog-api-key", props.getApiKey());

        Timer.Sample sample = Timer.start(meterRegistry);
        String outcome = "error";
        String status = NO_STATUS;
        try {
            ResponseEntity<Map> response = restTemplate.postForEntity(
                url, new HttpEntity<>(body, headers), Map.class);
            status = String.valueOf(response.getStatusCode().value());
            outcome = "parse_error";
            ReportContent content = parseContent(extractText(response.getBody()));
            outcome = "success";
            return content;
        } catch (HttpStatusCodeException e) {
            int code = e.getStatusCode().value();
            status = String.valueOf(code);
            log.warn("Gemini API error {}: {}", code, truncate(e.getResponseBodyAsString()));
            if (code == 429) {
                outcome = "quota_exceeded";
                throw new AiServiceQuotaExceededException();
            }
            if (e.getStatusCode().is5xxServerError()) {
                outcome = "server_error";
                throw new AiServiceUnavailableException(e);
            }
            outcome = "client_error";
            throw new ReportGenerationException("AI report generation failed", e);
        } catch (ResourceAccessException e) {
            outcome = classifyIoFailure(e);
            log.warn("Gemini API {}: {}", outcome, e.getMessage());
            throw new AiServiceUnavailableException(e);
        } catch (ReportGenerationException e) {
            throw e;
        } catch (RestClientException e) {
            // 응답 본문을 Map으로 읽지 못한 경우 (HTML 오류 페이지 등)
            outcome = "parse_error";
            throw new ReportGenerationException("Unreadable response from Gemini", e);
        } catch (RuntimeException e) {
            log.error("Gemini API unexpected error", e);
            throw new ReportGenerationException("AI report generation failed", e);
        } finally {
            long nanos = sample.stop(Timer.builder(METRIC)
                .description("Gemini generateContent 호출")
                .tag("outcome", outcome)
                .tag("status", status)
                .register(meterRegistry));
            log.info("Gemini API call: outcome={}, status={}, {} ms", outcome, status, nanos / 1_000_000);
        }
    }

    /** timeout 종류를 원인 예외로 구분한다. 태그 값은 고정된 몇 개뿐이라 cardinality가 낮다. */
    static String classifyIoFailure(Throwable e) {
        for (Throwable t = e; t != null; t = t.getCause()) {
            if (t instanceof ConnectionRequestTimeoutException) return "pool_exhausted";
            if (t instanceof ConnectTimeoutException
                || t instanceof ConnectException
                || t instanceof UnknownHostException
                || t instanceof NoRouteToHostException) return "connect_failed";
            if (t instanceof SocketTimeoutException) return "read_timeout";
        }
        return "io_error";
    }

    private String extractText(Map<String, Object> body) {
        if (body == null) {
            throw new ReportGenerationException("Empty response from Gemini");
        }
        JsonNode root = objectMapper.valueToTree(body);
        String text = root.path("candidates").path(0)
            .path("content").path("parts").path(0)
            .path("text").asText(null);
        if (text == null || text.isBlank()) {
            throw new ReportGenerationException("Empty response from Gemini");
        }
        return text.trim();
    }

    private ReportContent parseContent(String text) {
        JsonNode node;
        try {
            node = objectMapper.readTree(text);
        } catch (Exception primary) {
            Matcher m = JSON_OBJECT.matcher(text);
            if (!m.find()) {
                throw new ReportGenerationException("Failed to parse JSON from response: " + truncate(text), primary);
            }
            try {
                node = objectMapper.readTree(m.group());
            } catch (Exception fallback) {
                throw new ReportGenerationException("Failed to parse JSON from response: " + truncate(text), fallback);
            }
        }

        String keep = textOrNull(node, "keep");
        String problem = textOrNull(node, "problem");
        String tryAction = textOrNull(node, "try");
        String referenceQuestion = textOrNull(node, "referenceQuestion");

        if (keep == null || problem == null || tryAction == null) {
            throw new ReportGenerationException(
                "Incomplete report fields: keep=" + keep + ", problem=" + problem + ", try=" + tryAction);
        }
        return new ReportContent(keep, problem, tryAction, referenceQuestion);
    }

    private static String textOrNull(JsonNode node, String key) {
        JsonNode child = node.get(key);
        return (child == null || child.isNull()) ? null : child.asText();
    }

    private static String truncate(String s) {
        if (s == null) return "";
        return s.length() > 200 ? s.substring(0, 200) + "..." : s;
    }

    public record Result(ReportContent content, String promptVersion) {}
}
