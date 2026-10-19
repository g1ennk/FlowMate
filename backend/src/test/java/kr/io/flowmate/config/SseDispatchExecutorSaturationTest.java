package kr.io.flowmate.config;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import kr.io.flowmate.timer.sse.SseMetrics;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

/**
 * 운영 빈 설정 그대로(스레드 4~8, 큐 200) fan-out executor를 포화시켜, 조용히 버려지던 작업이 지표에 잡히는지 확인한다.
 * <p>
 * ThreadPoolExecutor는 코어 스레드 4개가 바쁘면 먼저 큐를 채우고, 큐가 가득 찬 뒤에야 스레드를 8개까지 늘린다.
 * 그래서 막힌 작업 4개 + 큐 200개 + 추가 스레드 4개 = 208개까지는 버리지 않고, 그 뒤부터 하나씩 버린다.
 */
class SseDispatchExecutorSaturationTest {

    private static final int CORE = 4;
    private static final int QUEUE = 200;
    private static final int MAX = 8;
    private static final int CAPACITY = MAX + QUEUE;
    private static final int OVERFLOW = 5;

    private SimpleMeterRegistry meterRegistry;
    private ExecutorService executor;
    private final CountDownLatch release = new CountDownLatch(1);
    private final Set<Integer> executed = ConcurrentHashMap.newKeySet();

    @BeforeEach
    void setUp() {
        meterRegistry = new SimpleMeterRegistry();
        executor = new RedisConfig().sseDispatchExecutor(meterRegistry);
    }

    @AfterEach
    void tearDown() {
        release.countDown();
        executor.shutdownNow();
    }

    @Test
    void 큐와_스레드가_모두_차면_가장_오래된_대기_작업을_버리고_dropped_지표를_올린다() {
        for (int i = 0; i < CAPACITY + OVERFLOW; i++) {
            int id = i;
            executor.submit(() -> {
                awaitRelease();
                executed.add(id);
            });
        }

        assertThat(dropped()).isEqualTo(OVERFLOW);
        assertThat(gauge(SseMetrics.DISPATCH_QUEUE_SIZE)).isEqualTo(QUEUE);
        assertThat(gauge(SseMetrics.DISPATCH_QUEUE_REMAINING)).isZero();

        release.countDown();
        await().atMost(5, TimeUnit.SECONDS).until(() -> executed.size() == CAPACITY);

        // 버려진 것은 큐에 가장 먼저 들어간 작업들(코어 스레드 4개가 잡은 0~3 바로 다음)이다
        Set<Integer> discarded = IntStream.range(0, CAPACITY + OVERFLOW).boxed()
                .filter(id -> !executed.contains(id))
                .collect(Collectors.toSet());
        assertThat(discarded).containsExactlyInAnyOrderElementsOf(
                IntStream.range(CORE, CORE + OVERFLOW).boxed().toList());
        assertThat(gauge(SseMetrics.DISPATCH_QUEUE_SIZE)).isZero();
        assertThat(gauge(SseMetrics.DISPATCH_QUEUE_REMAINING)).isEqualTo(QUEUE);
    }

    @Test
    void 포화되지_않으면_버린_작업이_없다() {
        for (int i = 0; i < CAPACITY; i++) {
            executor.submit(this::awaitRelease);
        }

        assertThat(dropped()).isZero();
    }

    @Test
    void 종료된_executor가_거절한_작업은_포화가_아니므로_세지_않는다() {
        executor.shutdown();

        executor.execute(() -> {
        });

        assertThat(dropped()).isZero();
    }

    private void awaitRelease() {
        try {
            release.await(5, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private double dropped() {
        return meterRegistry.get(SseMetrics.DISPATCH_DROPPED).counter().count();
    }

    private double gauge(String name) {
        return meterRegistry.get(name).gauge().value();
    }
}
