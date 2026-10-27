package kr.io.flowmate.report.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "gemini")
@Getter
@Setter
public class GeminiProperties {
    private String apiKey;
    private String baseUrl;
    private String model;
    /** connection pool에서 연결을 빌릴 때까지 기다리는 최대 시간 */
    private int connectionRequestTimeoutMs = 1000;
    private int connectTimeoutMs = 3000;
    /** 응답 바이트 사이의 최대 대기. generateContent는 생성이 끝난 뒤 한 번에 응답하므로 사실상 생성 대기 상한이다 */
    private int readTimeoutMs = 45000;
    private int maxConnections = 20;

    /** Gemini 호출 한 번이 timeout으로 끝나기까지 걸릴 수 있는 최대 시간 */
    public long worstCaseMs() {
        return (long) connectionRequestTimeoutMs + connectTimeoutMs + readTimeoutMs;
    }
}
