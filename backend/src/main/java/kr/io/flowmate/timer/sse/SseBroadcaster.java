package kr.io.flowmate.timer.sse;

import kr.io.flowmate.timer.event.TimerStateChangedEvent;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
@RequiredArgsConstructor
public class SseBroadcaster {

    public static final String CHANNEL = "flowmate:timer:state-changed";

    private final RedisTemplate<String, TimerStateChangedEvent> timerStateChangedEventRedisTemplate;

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onTimerStateChanged(TimerStateChangedEvent event) {
        timerStateChangedEventRedisTemplate.convertAndSend(CHANNEL, event);
    }
}
