package kr.io.flowmate.timer.sse;

import com.github.dockerjava.api.model.ExposedPort;
import com.github.dockerjava.api.model.PortBinding;
import com.github.dockerjava.api.model.Ports;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.RedisSystemException;
import org.springframework.data.redis.connection.RedisStandaloneConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceClientConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.listener.ChannelTopic;
import org.springframework.data.redis.listener.adapter.RedisListenerExecutionFailedException;
import org.springframework.util.backoff.BackOffExecution;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.utility.DockerImageName;

import java.io.IOException;
import java.net.ServerSocket;
import java.time.Duration;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.awaitility.Awaitility.await;

/**
 * Redis 구독이 끊기고 돌아올 때 구독 지표가 무엇을 보여 주는지 실제 Redis로 확인한다.
 * 결론: 구독 실패 지표는 컨테이너가 구독을 다시 시도하는 경우만 센다. 기동 시 첫 실패는 재시도 없이 예외로 끝나고,
 * 구독 중 끊김은 Lettuce가 스스로 다시 연결하고 다시 구독해 컨테이너를 거치지 않는다.
 * Redis를 내렸다가 같은 포트로 다시 띄워야 하므로 호스트 포트를 고정한 컨테이너를 쓴다.
 */
class MeteredRedisMessageListenerContainerTest {

    private static final String CHANNEL = "flowmate:test:subscriber-recovery";

    private int port;
    private SimpleMeterRegistry meterRegistry;
    private LettuceConnectionFactory subscriberFactory;
    private LettuceConnectionFactory publisherFactory;
    private MeteredRedisMessageListenerContainer container;
    private GenericContainer<?> redis;
    private final AtomicInteger received = new AtomicInteger();

    @BeforeEach
    void setUp() throws IOException {
        try (ServerSocket socket = new ServerSocket(0)) {
            port = socket.getLocalPort();
        }
        meterRegistry = new SimpleMeterRegistry();
        subscriberFactory = connectionFactory();
        publisherFactory = connectionFactory();

        container = new MeteredRedisMessageListenerContainer(meterRegistry);
        container.setConnectionFactory(subscriberFactory);
        container.setRecoveryInterval(200L);
        container.afterPropertiesSet();
        container.addMessageListener((message, pattern) -> received.incrementAndGet(), new ChannelTopic(CHANNEL));
    }

    @AfterEach
    void tearDown() throws Exception {
        container.stop();
        container.destroy();
        subscriberFactory.destroy();
        publisherFactory.destroy();
        if (redis != null) {
            redis.stop();
        }
    }

    @Test
    void 구독_재시도가_실패할_때마다_실패_지표를_올린다() {
        // 컨테이너가 구독 실패를 처리하는 경로를 직접 태운다. 실제로 어떤 장애가 이 경로를 타는지는 아래 두 테스트가 보여 준다
        container.handleSubscriptionException(new CompletableFuture<>(), () -> BackOffExecution.STOP,
                new RedisSystemException("subscribe failed", new IllegalStateException()));
        container.handleSubscriptionException(new CompletableFuture<>(), () -> BackOffExecution.STOP,
                new RedisSystemException("subscribe failed", new IllegalStateException()));

        assertThat(subscriptionFailures()).isEqualTo(2);
    }

    @Test
    void 기동_시점에_Redis가_없으면_구독은_재시도_없이_바로_실패한다() {
        // 첫 시도는 recovery 없이 예외로 끝난다. 운영에서는 컨텍스트 기동이 실패하므로 Redis 없이 서버가 뜨지 않는다
        assertThatThrownBy(container::start).isInstanceOf(RedisListenerExecutionFailedException.class);

        assertThat(subscriptionFailures()).isZero();
        assertThat(listening()).isZero();
    }

    @Test
    void 구독_중_Redis가_재시작되면_Lettuce가_다시_구독하고_구독_실패_지표는_오르지_않는다() {
        redis = startRedis();
        container.start();
        await().atMost(5, TimeUnit.SECONDS).until(() -> listening() == 1);
        publishUntilReceived();

        redis.stop();
        redis = startRedis();

        // 끊긴 동안 발행한 메시지는 사라진다. 다시 구독된 뒤에 발행한 메시지는 도착한다
        publishUntilReceived();
        assertThat(subscriptionFailures()).isZero();
        assertThat(listening()).isEqualTo(1);
    }

    private void publishUntilReceived() {
        int before = received.get();
        StringRedisTemplate publisher = new StringRedisTemplate(publisherFactory);
        await().atMost(30, TimeUnit.SECONDS).pollInterval(Duration.ofMillis(200)).until(() -> {
            try {
                publisher.convertAndSend(CHANNEL, "ping");
            } catch (Exception ignored) {
                // 발행 쪽 연결이 아직 복구되지 않았다
            }
            return received.get() > before;
        });
    }

    private GenericContainer<?> startRedis() {
        GenericContainer<?> container = new GenericContainer<>(DockerImageName.parse("redis:7-alpine"))
                .withExposedPorts(6379)
                .withCreateContainerCmdModifier(cmd -> cmd.getHostConfig().withPortBindings(
                        new PortBinding(Ports.Binding.bindPort(port), new ExposedPort(6379))));
        container.start();
        return container;
    }

    private LettuceConnectionFactory connectionFactory() {
        LettuceConnectionFactory factory = new LettuceConnectionFactory(
                new RedisStandaloneConfiguration("127.0.0.1", port),
                LettuceClientConfiguration.builder().commandTimeout(Duration.ofSeconds(2)).build()
        );
        factory.afterPropertiesSet();
        factory.start();
        return factory;
    }

    private double subscriptionFailures() {
        return meterRegistry.get(SseMetrics.SUBSCRIBER_FAILURES).counter().count();
    }

    private double listening() {
        return meterRegistry.get(SseMetrics.SUBSCRIBER_LISTENING).gauge().value();
    }
}
