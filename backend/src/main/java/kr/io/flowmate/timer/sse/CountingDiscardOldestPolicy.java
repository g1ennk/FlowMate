package kr.io.flowmate.timer.sse;

import io.micrometer.core.instrument.Counter;

import java.util.concurrent.ThreadPoolExecutor;

/**
 * DiscardOldestPolicy와 같은 동작(가장 오래된 대기 작업을 버리고 새 작업을 넣는다)에 버린 횟수만 센다.
 * DiscardOldestPolicy는 예외 없이 조용히 버리므로 submit() 쪽에서는 유실을 알 수 없다.
 * 종료 중인 executor가 새 작업을 버리는 경우는 포화가 아니므로 세지 않는다.
 */
public class CountingDiscardOldestPolicy extends ThreadPoolExecutor.DiscardOldestPolicy {

    private final Counter dropped;

    public CountingDiscardOldestPolicy(Counter dropped) {
        this.dropped = dropped;
    }

    @Override
    public void rejectedExecution(Runnable task, ThreadPoolExecutor executor) {
        if (!executor.isShutdown()) {
            dropped.increment();
        }
        super.rejectedExecution(task, executor);
    }
}
