package kr.io.flowmate.timer.sse;

import kr.io.flowmate.timer.event.TimerStateChangedEvent;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.RedisTemplate;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;

@ExtendWith(MockitoExtension.class)
class SseBroadcasterFailSilentTest {

    @Mock
    private RedisTemplate<String, TimerStateChangedEvent> redisTemplate;

    @Test
    void Redis_publish_실패가_호출자에게_전파되지_않음() {
        TimerStateChangedEvent event = TimerStateChangedEvent.of(
                "user-1", "todo-1", 100L, null
        );
        doThrow(new RuntimeException("redis down"))
                .when(redisTemplate).convertAndSend(anyString(), any());
        SseBroadcaster broadcaster = new SseBroadcaster(redisTemplate);

        assertThatCode(() -> broadcaster.onTimerStateChanged(event))
                .doesNotThrowAnyException();
    }
}
