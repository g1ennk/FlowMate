package kr.io.flowmate.timer.sse;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import kr.io.flowmate.timer.event.TimerStateChangedEvent;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Slf4j
@Component
public class SseBroadcaster {

    public static final String CHANNEL = "flowmate:timer:state-changed";

    private final RedisTemplate<String, TimerStateChangedEvent> timerStateChangedEventRedisTemplate;
    private final Counter publishSuccess;
    private final Counter publishFailure;

    public SseBroadcaster(
            RedisTemplate<String, TimerStateChangedEvent> timerStateChangedEventRedisTemplate,
            MeterRegistry meterRegistry
    ) {
        this.timerStateChangedEventRedisTemplate = timerStateChangedEventRedisTemplate;
        this.publishSuccess = meterRegistry.counter(SseMetrics.PUBLISH, SseMetrics.RESULT, SseMetrics.SUCCESS);
        this.publishFailure = meterRegistry.counter(SseMetrics.PUBLISH, SseMetrics.RESULT, SseMetrics.FAILURE);
    }

    // 실패해도 다시 보내지 않는다(at-most-once). 상태는 이미 커밋됐고, 놓친 기기는 재연결 때 다시 조회한다
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onTimerStateChanged(TimerStateChangedEvent event) {
        try {
            timerStateChangedEventRedisTemplate.convertAndSend(CHANNEL, event);
            publishSuccess.increment();
            log.debug("sse.publish.ok userId={} version={}", event.userId(), event.version());
        } catch (Exception ex) {
            publishFailure.increment();
            log.warn("sse.publish.failed userId={} version={} err={}",
                    event.userId(), event.version(), ex.getMessage(), ex);
        }
    }
}
