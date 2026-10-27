package kr.io.flowmate.timer.sse;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;
import org.springframework.util.backoff.BackOffExecution;

import java.util.concurrent.CompletableFuture;

/**
 * 구독 실패 횟수와 구독 상태를 지표로 내보내는 리스너 컨테이너. 동작은 바꾸지 않고 세기만 한다.
 * <p>
 * 이 훅이 보는 범위는 좁다. 연결은 얻었지만 구독 명령이 실패했거나, 컨테이너가 recovery 간격마다 구독을 다시 시도하다
 * 실패한 경우만 센다. 기동 시 첫 연결 실패는 재시도 없이 start() 예외로 끝나 서버가 뜨지 않는다.
 * 구독 중에 Redis 연결이 끊기면 Lettuce가 스스로 다시 연결하고 채널을 다시 구독하므로 이 훅도, 구독 상태 gauge도 바뀌지 않는다.
 * 그 사이에 발행된 메시지는 사라지고, 같은 Redis를 쓰는 발행 쪽 실패 지표(flowmate.sse.publish)에 드러난다.
 */
public class MeteredRedisMessageListenerContainer extends RedisMessageListenerContainer {

    private final Counter subscriptionFailures;

    public MeteredRedisMessageListenerContainer(MeterRegistry meterRegistry) {
        this.subscriptionFailures = meterRegistry.counter(SseMetrics.SUBSCRIBER_FAILURES);
        Gauge.builder(SseMetrics.SUBSCRIBER_LISTENING, this, container -> container.isListening() ? 1 : 0)
                .register(meterRegistry);
    }

    @Override
    protected void handleSubscriptionException(
            CompletableFuture<Void> future, BackOffExecution backOffExecution, Throwable cause
    ) {
        subscriptionFailures.increment();
        super.handleSubscriptionException(future, backOffExecution, cause);
    }
}
