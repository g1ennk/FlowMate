package kr.io.flowmate.config;

import com.redis.testcontainers.RedisContainer;
import kr.io.flowmate.timer.event.TimerStateChangedEvent;
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
        assertThat(executor.getRejectedExecutionHandler())
                .isInstanceOf(ThreadPoolExecutor.DiscardOldestPolicy.class);
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
