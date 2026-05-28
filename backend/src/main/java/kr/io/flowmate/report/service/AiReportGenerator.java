package kr.io.flowmate.report.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
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
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.HttpServerErrorException;
import org.springframework.web.client.RestTemplate;

import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Slf4j
@Component
public class AiReportGenerator {

    private static final Pattern JSON_OBJECT = Pattern.compile("\\{[\\s\\S]*\\}");

    private final RestTemplate restTemplate;
    private final GeminiProperties props;
    private final ObjectMapper objectMapper;

    public AiReportGenerator(@Qualifier("geminiRestTemplate") RestTemplate restTemplate,
                             GeminiProperties props,
                             ObjectMapper objectMapper) {
        this.restTemplate = restTemplate;
        this.props = props;
        this.objectMapper = objectMapper;
    }

    public Result generate(ReportType type, List<Todo> todos, List<Review> weeklyReviews) {
        String prompt = switch (type) {
            case DAILY -> ReportPrompts.daily(todos);
            case WEEKLY -> ReportPrompts.weekly(todos);
            case MONTHLY -> ReportPrompts.monthly(todos, weeklyReviews);
        };
        String text = callGemini(prompt);
        ReportContent content = parseContent(text);
        return new Result(content, type.promptVersion());
    }

    @SuppressWarnings({"rawtypes", "unchecked"})
    private String callGemini(String userPrompt) {
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

        long started = System.currentTimeMillis();
        try {
            ResponseEntity<Map> response = restTemplate.postForEntity(
                url, new HttpEntity<>(body, headers), Map.class);
            log.info("Gemini API call: {} ms", System.currentTimeMillis() - started);
            return extractText(response.getBody());
        } catch (HttpClientErrorException e) {
            log.error("Gemini API client error {}: {}", e.getStatusCode(), e.getResponseBodyAsString());
            if (e.getStatusCode().value() == 429) {
                throw new AiServiceQuotaExceededException();
            }
            throw new ReportGenerationException("AI report generation failed", e);
        } catch (HttpServerErrorException e) {
            log.error("Gemini API server error {}: {}", e.getStatusCode(), e.getResponseBodyAsString());
            if (e.getStatusCode().value() == 503) {
                throw new AiServiceUnavailableException();
            }
            throw new ReportGenerationException("AI report generation failed", e);
        } catch (ReportGenerationException e) {
            throw e;
        } catch (Exception e) {
            log.error("Gemini API unexpected error", e);
            throw new ReportGenerationException("AI report generation failed", e);
        }
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
        return s.length() > 200 ? s.substring(0, 200) + "..." : s;
    }

    public record Result(ReportContent content, String promptVersion) {}
}
