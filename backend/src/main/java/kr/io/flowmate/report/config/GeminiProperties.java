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
    private int connectTimeoutMs;
    private int readTimeoutMs;
}
