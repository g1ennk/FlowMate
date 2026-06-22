package kr.io.flowmate.timer.sse;

import com.redis.testcontainers.RedisContainer;
import kr.io.flowmate.timer.event.TimerStateChangedEvent;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.redis.connection.MessageListener;
import org.springframework.data.redis.listener.ChannelTopic;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

@SpringBootTest
@ActiveProfiles("test")
@Testcontainers
class SseBroadcasterTest {

    private static final String CHANNEL = "flowmate:timer:state-changed";

    @Container
    static RedisContainer redis = new RedisContainer(DockerImageName.parse("redis:7-alpine"));

    @DynamicPropertySource
    static void redisProps(DynamicPropertyRegistry registry) {
        registry.add("spring.data.redis.host", redis::getHost);
        registry.add("spring.data.redis.port", () -> redis.getMappedPort(6379));
    }

    @Autowired
    private ApplicationEventPublisher publisher;

    @Autowired
    private RedisMessageListenerContainer container;

    @Autowired
    private TransactionTemplate transactionTemplate;

    @Test
    void 트랜잭션_커밋_후_Redis_채널에_publish_도달() {
        AtomicInteger received = new AtomicInteger();
        MessageListener listener = (message, pattern) -> received.incrementAndGet();
        container.addMessageListener(listener, new ChannelTopic(CHANNEL));

        try {
            transactionTemplate.executeWithoutResult(status ->
                    publisher.publishEvent(
                            TimerStateChangedEvent.of("user-1", "todo-1", 100L, "{}")
                    )
            );

            await().atMost(2, TimeUnit.SECONDS).untilAsserted(() ->
                    assertThat(received.get()).isEqualTo(1)
            );
        } finally {
            container.removeMessageListener(listener);
        }
    }

    @Test
    void 트랜잭션_롤백_시_publish_발생_안함() throws InterruptedException {
        AtomicInteger received = new AtomicInteger();
        MessageListener listener = (message, pattern) -> received.incrementAndGet();
        container.addMessageListener(listener, new ChannelTopic(CHANNEL));

        try {
            transactionTemplate.executeWithoutResult(status -> {
                publisher.publishEvent(
                        TimerStateChangedEvent.of("user-1", "todo-rollback", 200L, "{}")
                );
                status.setRollbackOnly();
            });

            Thread.sleep(1000L);
            assertThat(received.get()).isZero();
        } finally {
            container.removeMessageListener(listener);
        }
    }
}
