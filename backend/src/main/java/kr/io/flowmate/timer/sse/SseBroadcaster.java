package kr.io.flowmate.timer.sse;

import kr.io.flowmate.timer.event.TimerStateChangedEvent;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Slf4j
@Component
@RequiredArgsConstructor
public class SseBroadcaster {

    public static final String CHANNEL = "flowmate:timer:state-changed";

    private final RedisTemplate<String, TimerStateChangedEvent> timerStateChangedEventRedisTemplate;

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onTimerStateChanged(TimerStateChangedEvent event) {
        try {
            timerStateChangedEventRedisTemplate.convertAndSend(CHANNEL, event);
            log.debug("sse.publish.ok userId={} version={}", event.userId(), event.version());
        } catch (Exception ex) {
            log.warn("sse.publish.failed userId={} version={} err={}",
                    event.userId(), event.version(), ex.getMessage(), ex);
        }
    }
}
