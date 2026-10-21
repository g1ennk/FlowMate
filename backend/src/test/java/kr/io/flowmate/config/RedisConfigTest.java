package kr.io.flowmate.config;

import com.redis.testcontainers.RedisContainer;
import io.micrometer.core.instrument.MeterRegistry;
import kr.io.flowmate.timer.event.TimerStateChangedEvent;
import kr.io.flowmate.timer.sse.CountingDiscardOldestPolicy;
import kr.io.flowmate.timer.sse.SseMetrics;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.data.redis.serializer.JacksonJsonRedisSerializer;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.util.List;
import java.util.concurrent.ThreadPoolExecutor;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@ActiveProfiles("test")
@Testcontainers
class RedisConfigTest {

    @Container
    static RedisContainer redis = new RedisContainer(DockerImageName.parse("redis:7-alpine"));

    @DynamicPropertySource
    static void redisProps(DynamicPropertyRegistry registry) {
        registry.add("spring.data.redis.host", redis::getHost);
        registry.add("spring.data.redis.port", () -> redis.getMappedPort(6379));
    }

    @Autowired
    private ApplicationContext context;

    @Autowired
    @Qualifier("timerStateChangedEventSerializer")
    private JacksonJsonRedisSerializer<TimerStateChangedEvent> serializer;

    @Test
    void 애플리케이션_컨텍스트는_PubSub에_필요한_빈을_등록한다() {
        // given
        String[] requiredBeanNames = {
                "subscriberConnectionFactory",
                "timerStateChangedEventSerializer",
                "timerStateChangedEventRedisTemplate",
                "sseDispatchExecutor",
                "redisMessageListenerContainer"
        };

        // when
        ThreadPoolExecutor executor = context.getBean(
                "sseDispatchExecutor", ThreadPoolExecutor.class
        );

        // then
        assertThat(requiredBeanNames).allMatch(context::containsBean);
        // 포화 정책은 discard-oldest 그대로이고, 버린 수만 센다
        assertThat(executor.getRejectedExecutionHandler())
                .isInstanceOf(ThreadPoolExecutor.DiscardOldestPolicy.class)
                .isInstanceOf(CountingDiscardOldestPolicy.class);
    }

    @Test
    void SSE_전달_지표가_애플리케이션_MeterRegistry에_등록된다() {
        // given
        MeterRegistry meterRegistry = context.getBean(MeterRegistry.class);

        // when
        List<String> names = meterRegistry.getMeters().stream()
                .map(meter -> meter.getId().getName())
                .toList();

        // then
        assertThat(names).contains(
                SseMetrics.PUBLISH,
                SseMetrics.DISPATCH_QUEUE_SIZE,
                SseMetrics.DISPATCH_QUEUE_REMAINING,
                SseMetrics.DISPATCH_DROPPED,
                SseMetrics.FANOUT,
                SseMetrics.CONNECTIONS,
                SseMetrics.SUBSCRIBER_FAILURES,
                SseMetrics.SUBSCRIBER_LISTENING
        );
        assertThat(meterRegistry.get(SseMetrics.SUBSCRIBER_LISTENING).gauge().value()).isEqualTo(1);
    }

    @Test
    void 이벤트_직렬화기는_TimerStateChangedEvent를_JSON으로_왕복_변환한다() {
        // given
        TimerStateChangedEvent source = new TimerStateChangedEvent(
                "user-1", "todo-1", 100L, 200L, "{\"status\":\"running\"}"
        );

        // when
        TimerStateChangedEvent restored = serializer.deserialize(serializer.serialize(source));

        // then
        assertThat(restored).isEqualTo(source);
    }
}
