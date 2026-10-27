package kr.io.flowmate.report.service;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import kr.io.flowmate.report.config.ReportGuardProperties;
import kr.io.flowmate.report.domain.ReportType;
import kr.io.flowmate.report.exception.ReportGenerationInProgressException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@DisplayName("ReportGenerationLock (Redis IT)")
class ReportGenerationLockIT {

    private static final String USER = "user-1";
    private static final LocalDate DAY = LocalDate.parse("2026-10-20");
    private static final String KEY = "report:generate:user-1:DAILY:2026-10-20";

    private ReportRedisSupport.Connected redis;
    private SimpleMeterRegistry meterRegistry;
    private ReportGenerationLock lock;

    @BeforeEach
    void setUp() {
        redis = ReportRedisSupport.connect();
        redis.flush();
        meterRegistry = new SimpleMeterRegistry();
        lock = new ReportGenerationLock(redis.template(), new ReportGuardProperties(), meterRegistry);
    }

    @AfterEach
    void tearDown() {
        redis.close();
    }

    @Test
    @DisplayName("SET NX EX로 owner token을 저장하고 TTL을 건다")
    void acquire_setsTokenWithTtl() {
        ReportGenerationLock.Handle handle = lock.acquire(USER, ReportType.DAILY, DAY);

        assertThat(handle.key()).isEqualTo(KEY);
        assertThat(redis.template().opsForValue().get(KEY)).isEqualTo(handle.token());
        assertThat(redis.template().getExpire(KEY)).isBetween(55L, 60L);
    }

    @Test
    @DisplayName("lock이 있으면 두 번째 요청은 409 예외 + in_progress 거절 지표")
    void acquire_busy() {
        lock.acquire(USER, ReportType.DAILY, DAY);

        assertThatThrownBy(() -> lock.acquire(USER, ReportType.DAILY, DAY))
            .isInstanceOf(ReportGenerationInProgressException.class);
        assertThat(meterRegistry.counter(ReportGuardMetrics.REJECTED, "reason", "in_progress").count()).isEqualTo(1);
    }

    @Test
    @DisplayName("기간이나 type이 다르면 서로 막지 않는다")
    void acquire_differentKeys() {
        lock.acquire(USER, ReportType.DAILY, DAY);

        assertThatCode(() -> lock.acquire(USER, ReportType.WEEKLY, DAY)).doesNotThrowAnyException();
        assertThatCode(() -> lock.acquire(USER, ReportType.DAILY, DAY.plusDays(1))).doesNotThrowAnyException();
        assertThatCode(() -> lock.acquire("user-2", ReportType.DAILY, DAY)).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("release 후에는 다시 획득할 수 있다")
    void release_thenReacquire() {
        ReportGenerationLock.Handle handle = lock.acquire(USER, ReportType.DAILY, DAY);

        lock.release(handle);

        assertThat(redis.template().hasKey(KEY)).isFalse();
        assertThatCode(() -> lock.acquire(USER, ReportType.DAILY, DAY)).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("TTL이 지나 다른 요청이 새로 건 lock은 이전 소유자가 지우지 못한다")
    void release_doesNotDeleteOthersLock() throws InterruptedException {
        ReportGuardProperties shortTtl = new ReportGuardProperties();
        shortTtl.setLockTtl(Duration.ofMillis(300));
        ReportGenerationLock shortLock = new ReportGenerationLock(redis.template(), shortTtl, meterRegistry);

        ReportGenerationLock.Handle stale = shortLock.acquire(USER, ReportType.DAILY, DAY);
        Thread.sleep(500);
        ReportGenerationLock.Handle current = shortLock.acquire(USER, ReportType.DAILY, DAY);

        shortLock.release(stale);

        assertThat(redis.template().opsForValue().get(KEY)).isEqualTo(current.token());
    }

    @Test
    @DisplayName("Redis에 연결할 수 없으면 fail-open: lock 없이 진행하고 해제도 예외 없이 넘어간다")
    void redisDown_failOpen() {
        try (ReportRedisSupport.Connected down = ReportRedisSupport.unreachable()) {
            ReportGenerationLock downLock = new ReportGenerationLock(down.template(), new ReportGuardProperties(), meterRegistry);

            ReportGenerationLock.Handle handle = downLock.acquire(USER, ReportType.DAILY, DAY);

            assertThat(handle.bypassed()).isTrue();
            assertThatCode(() -> downLock.release(handle)).doesNotThrowAnyException();
            assertThat(meterRegistry.counter(ReportGuardMetrics.REDIS_FAILURE, "op", "lock_acquire").count())
                .isEqualTo(1);
        }
    }
}
