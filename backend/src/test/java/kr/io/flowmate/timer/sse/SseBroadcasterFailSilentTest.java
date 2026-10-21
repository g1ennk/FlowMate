package kr.io.flowmate.timer.sse;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import kr.io.flowmate.timer.event.TimerStateChangedEvent;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.RedisTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;

@ExtendWith(MockitoExtension.class)
class SseBroadcasterFailSilentTest {

    private static final TimerStateChangedEvent EVENT = TimerStateChangedEvent.of(
            "user-1", "todo-1", 100L, null
    );

    @Mock
    private RedisTemplate<String, TimerStateChangedEvent> redisTemplate;

    private SimpleMeterRegistry meterRegistry;
    private SseBroadcaster broadcaster;

    @BeforeEach
    void setUp() {
        meterRegistry = new SimpleMeterRegistry();
        broadcaster = new SseBroadcaster(redisTemplate, meterRegistry);
    }

    @Test
    void Redis_publish_실패가_호출자에게_전파되지_않음() {
        doThrow(new RuntimeException("redis down"))
                .when(redisTemplate).convertAndSend(anyString(), any());

        assertThatCode(() -> broadcaster.onTimerStateChanged(EVENT))
                .doesNotThrowAnyException();
    }

    @Test
    void Redis_publish_실패는_failure_지표로_센다() {
        doThrow(new RuntimeException("redis down"))
                .when(redisTemplate).convertAndSend(anyString(), any());

        broadcaster.onTimerStateChanged(EVENT);

        assertThat(publishCount(SseMetrics.FAILURE)).isEqualTo(1);
        assertThat(publishCount(SseMetrics.SUCCESS)).isZero();
    }

    @Test
    void Redis_publish_성공은_success_지표로_센다() {
        broadcaster.onTimerStateChanged(EVENT);

        assertThat(publishCount(SseMetrics.SUCCESS)).isEqualTo(1);
        assertThat(publishCount(SseMetrics.FAILURE)).isZero();
    }

    private double publishCount(String result) {
        return meterRegistry.get(SseMetrics.PUBLISH).tag(SseMetrics.RESULT, result).counter().count();
    }
}
