package kr.io.flowmate.config;

import kr.io.flowmate.report.config.GeminiProperties;
import org.apache.hc.client5.http.config.ConnectionConfig;
import org.apache.hc.client5.http.config.RequestConfig;
import org.apache.hc.client5.http.impl.classic.CloseableHttpClient;
import org.apache.hc.client5.http.impl.classic.HttpClients;
import org.apache.hc.client5.http.impl.io.PoolingHttpClientConnectionManager;
import org.apache.hc.client5.http.impl.io.PoolingHttpClientConnectionManagerBuilder;
import org.apache.hc.core5.util.TimeValue;
import org.apache.hc.core5.util.Timeout;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.http.client.HttpComponentsClientHttpRequestFactory;
import org.springframework.web.client.RestTemplate;

@Configuration
public class AppConfig {

    @Bean
    @Primary
    public RestTemplate restTemplate() {
        return new RestTemplate();
    }

    @Bean(name = "geminiRestTemplate")
    public RestTemplate geminiRestTemplate(@Qualifier("geminiHttpClient") CloseableHttpClient geminiHttpClient) {
        return new RestTemplate(new HttpComponentsClientHttpRequestFactory(geminiHttpClient));
    }

    /**
     * Gemini 전용 pooling client. 요청마다 TCP/TLS 연결을 새로 맺지 않도록 연결을 재사용한다.
     * POST를 다시 보내면 비용이 두 번 들므로 자동 재시도는 끈다.
     */
    @Bean(name = "geminiHttpClient", destroyMethod = "close")
    public CloseableHttpClient geminiHttpClient(GeminiProperties props) {
        return buildGeminiHttpClient(props);
    }

    public static CloseableHttpClient buildGeminiHttpClient(GeminiProperties props) {
        ConnectionConfig connectionConfig = ConnectionConfig.custom()
                .setConnectTimeout(Timeout.ofMilliseconds(props.getConnectTimeoutMs()))
                .setSocketTimeout(Timeout.ofMilliseconds(props.getReadTimeoutMs()))
                // 서버가 먼저 닫은 keep-alive 연결을 재사용하다 실패하지 않도록, 쉬었던 연결은 검사한 뒤 쓴다
                .setValidateAfterInactivity(TimeValue.ofSeconds(5))
                .build();
        PoolingHttpClientConnectionManager pool = PoolingHttpClientConnectionManagerBuilder.create()
                .setDefaultConnectionConfig(connectionConfig)
                .setMaxConnTotal(props.getMaxConnections())
                .setMaxConnPerRoute(props.getMaxConnections())
                .build();
        RequestConfig requestConfig = RequestConfig.custom()
                .setConnectionRequestTimeout(Timeout.ofMilliseconds(props.getConnectionRequestTimeoutMs()))
                .setResponseTimeout(Timeout.ofMilliseconds(props.getReadTimeoutMs()))
                .build();
        return HttpClients.custom()
                .setConnectionManager(pool)
                .setDefaultRequestConfig(requestConfig)
                .disableAutomaticRetries()
                .evictIdleConnections(TimeValue.ofSeconds(30))
                .build();
    }
}
