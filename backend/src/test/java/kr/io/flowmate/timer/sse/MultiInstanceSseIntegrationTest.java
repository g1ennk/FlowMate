package kr.io.flowmate.timer.sse;

import com.redis.testcontainers.RedisContainer;
import kr.io.flowmate.timer.event.TimerStateChangedEvent;
import kr.io.flowmate.timer.service.SseEmitterRegistry;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.util.concurrent.TimeUnit;

import static org.awaitility.Awaitility.await;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

@SpringBootTest
@ActiveProfiles("test")
@Testcontainers
@Import(MultiInstanceSseIntegrationTest.RegistryConfig.class)
class MultiInstanceSseIntegrationTest {

    @Container
    static RedisContainer redis = new RedisContainer(DockerImageName.parse("redis:7-alpine"));

    @DynamicPropertySource
    static void redisProps(DynamicPropertyRegistry registry) {
        registry.add("spring.data.redis.host", redis::getHost);
        registry.add("spring.data.redis.port", () -> redis.getMappedPort(6379));
    }

    @Autowired
    private RedisTemplate<String, TimerStateChangedEvent> timerStateChangedEventRedisTemplate;

    @Autowired
    private SseEmitterRegistry instanceBRegistry;

    @Test
    void 인스턴스A_publish가_인스턴스B_emitter_registry에_도달() {
        TimerStateChangedEvent event = TimerStateChangedEvent.of(
                "user-1", "todo-1", 100L, "{\"status\":\"running\"}"
        );

        timerStateChangedEventRedisTemplate.convertAndSend(SseBroadcaster.CHANNEL, event);

        await().atMost(2, TimeUnit.SECONDS).untilAsserted(() ->
                verify(instanceBRegistry).broadcast(eq("user-1"), any())
        );
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class RegistryConfig {

        @Bean
        @Primary
        SseEmitterRegistry instanceBRegistry() {
            return mock(SseEmitterRegistry.class);
        }
    }
}