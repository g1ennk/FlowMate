package kr.io.flowmate.report.service;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import kr.io.flowmate.config.AppConfig;
import kr.io.flowmate.report.config.GeminiProperties;
import kr.io.flowmate.report.domain.ReportType;
import kr.io.flowmate.report.exception.AiServiceQuotaExceededException;
import kr.io.flowmate.report.exception.AiServiceUnavailableException;
import kr.io.flowmate.report.prompt.TodoFixtures;
import org.apache.hc.client5.http.impl.classic.CloseableHttpClient;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.client.HttpComponentsClientHttpRequestFactory;
import org.springframework.web.client.RestTemplate;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 실제 소켓으로 timeout과 connection pool 동작을 확인한다.
 * MockRestServiceServer는 request factory를 바꿔 끼우므로 timeout을 재현할 수 없다.
 */
@DisplayName("AiReportGenerator + pooling HTTP client (로컬 stub 서버)")
class AiReportGeneratorHttpTest {

    private static final String OK_BODY = """
        {"candidates":[{"content":{"parts":[{"text":"{\\"keep\\":\\"k\\",\\"problem\\":\\"p\\",\\"try\\":\\"t\\"}"}]}}]}
        """;

    private HttpServer server;
    private ExecutorService serverExecutor;
    private CloseableHttpClient httpClient;
    private final SimpleMeterRegistry meterRegistry = new SimpleMeterRegistry();
    private final Set<Integer> clientPorts = ConcurrentHashMap.newKeySet();

    @AfterEach
    void tearDown() throws IOException {
        if (httpClient != null) httpClient.close();
        if (server != null) server.stop(0);
        if (serverExecutor != null) serverExecutor.shutdownNow();
    }

    @Test
    @DisplayName("read timeout이 지나면 기다리지 않고 503으로 끝난다")
    void readTimeout() throws IOException {
        startServer(exchange -> {
            sleep(2_000);
            respond(exchange, 200, OK_BODY);
        });
        AiReportGenerator generator = generator(props(200, 300, 1));

        long started = System.nanoTime();
        assertThatThrownBy(() -> generate(generator))
            .isInstanceOf(AiServiceUnavailableException.class);
        long elapsedMs = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started);

        assertThat(elapsedMs).isLessThan(1_500);
        assertThat(count("read_timeout")).isEqualTo(1);
    }

    @Test
    @DisplayName("연결을 받는 서버가 없으면 503 connect_failed")
    void connectFailed() throws IOException {
        int closedPort;
        try (ServerSocket socket = new ServerSocket(0)) {
            closedPort = socket.getLocalPort();
        }
        GeminiProperties props = props(200, 300, 1);
        props.setBaseUrl("http://127.0.0.1:" + closedPort);
        AiReportGenerator generator = generator(props);

        assertThatThrownBy(() -> generate(generator))
            .isInstanceOf(AiServiceUnavailableException.class);
        assertThat(count("connect_failed")).isEqualTo(1);
    }

    @Test
    @DisplayName("pool이 모두 사용 중이면 connection-request timeout 뒤 503 pool_exhausted")
    void poolExhausted() throws Exception {
        CountDownLatch firstArrived = new CountDownLatch(1);
        startServer(exchange -> {
            firstArrived.countDown();
            sleep(1_000);
            respond(exchange, 200, OK_BODY);
        });
        AiReportGenerator generator = generator(props(200, 3_000, 1));

        CompletableFuture<AiReportGenerator.Result> first = CompletableFuture.supplyAsync(() -> generate(generator));
        assertThat(firstArrived.await(2, TimeUnit.SECONDS)).isTrue();

        assertThatThrownBy(() -> generate(generator))
            .isInstanceOf(AiServiceUnavailableException.class);
        assertThat(count("pool_exhausted")).isEqualTo(1);
        assertThat(first.get(3, TimeUnit.SECONDS).content().keep()).isEqualTo("k");
    }

    @Test
    @DisplayName("연속 호출은 같은 TCP 연결을 재사용한다")
    void reusesConnection() throws IOException {
        startServer(exchange -> respond(exchange, 200, OK_BODY));
        AiReportGenerator generator = generator(props(200, 1_000, 2));

        generate(generator);
        generate(generator);
        generate(generator);

        assertThat(clientPorts).hasSize(1);
        assertThat(count("success")).isEqualTo(3);
    }

    @Test
    @DisplayName("실제 429 응답은 AI_QUOTA_EXCEEDED, 실제 503 응답은 AI_SERVICE_UNAVAILABLE")
    void upstreamStatuses() throws IOException {
        int[] status = {429};
        startServer(exchange -> respond(exchange, status[0], "{\"error\":{\"code\":" + status[0] + "}}"));
        AiReportGenerator generator = generator(props(200, 1_000, 1));

        assertThatThrownBy(() -> generate(generator)).isInstanceOf(AiServiceQuotaExceededException.class);
        status[0] = 503;
        assertThatThrownBy(() -> generate(generator)).isInstanceOf(AiServiceUnavailableException.class);

        assertThat(count("quota_exceeded")).isEqualTo(1);
        assertThat(count("server_error")).isEqualTo(1);
    }

    private void startServer(Handler handler) throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        serverExecutor = Executors.newCachedThreadPool();
        server.setExecutor(serverExecutor);
        server.createContext("/", exchange -> {
            clientPorts.add(exchange.getRemoteAddress().getPort());
            exchange.getRequestBody().readAllBytes();
            handler.handle(exchange);
        });
        server.start();
    }

    private GeminiProperties props(int connectionRequestTimeoutMs, int readTimeoutMs, int maxConnections) {
        GeminiProperties props = new GeminiProperties();
        props.setApiKey("test-key");
        props.setBaseUrl(server == null ? "http://127.0.0.1:1" : "http://127.0.0.1:" + server.getAddress().getPort());
        props.setModel("gemini-test");
        props.setConnectionRequestTimeoutMs(connectionRequestTimeoutMs);
        props.setConnectTimeoutMs(500);
        props.setReadTimeoutMs(readTimeoutMs);
        props.setMaxConnections(maxConnections);
        return props;
    }

    private AiReportGenerator generator(GeminiProperties props) {
        httpClient = AppConfig.buildGeminiHttpClient(props);
        RestTemplate restTemplate = new RestTemplate(new HttpComponentsClientHttpRequestFactory(httpClient));
        return new AiReportGenerator(restTemplate, props, meterRegistry);
    }

    private static AiReportGenerator.Result generate(AiReportGenerator generator) {
        return generator.generate(ReportType.DAILY, List.of(TodoFixtures.completed("x", 60, 1)), null);
    }

    private long count(String outcome) {
        var timer = meterRegistry.find(AiReportGenerator.METRIC).tag("outcome", outcome).timer();
        return timer == null ? 0 : timer.count();
    }

    private static void respond(HttpExchange exchange, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream out = exchange.getResponseBody()) {
            out.write(bytes);
        } catch (IOException ignored) {
            // timeout으로 클라이언트가 먼저 끊은 경우
        }
    }

    private static void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    @FunctionalInterface
    private interface Handler {
        void handle(HttpExchange exchange) throws IOException;
    }
}
