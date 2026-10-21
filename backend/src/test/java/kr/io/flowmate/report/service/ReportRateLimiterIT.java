package kr.io.flowmate.report.service;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import kr.io.flowmate.report.config.ReportGuardProperties;
import kr.io.flowmate.report.domain.ReportType;
import kr.io.flowmate.report.exception.ReportRateLimitedException;
import kr.io.flowmate.report.exception.ReportRateLimitedException.Reason;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.catchThrowableOfType;

@DisplayName("ReportRateLimiter (Redis IT)")
class ReportRateLimiterIT {

    private static final String USER = "user-1";
    private static final LocalDate DAY = LocalDate.parse("2026-10-20");

    private ReportRedisSupport.Connected redis;
    private SimpleMeterRegistry meterRegistry;
    private ReportGuardProperties props;
    private ReportRateLimiter limiter;

    @BeforeEach
    void setUp() {
        redis = ReportRedisSupport.connect();
        redis.flush();
        meterRegistry = new SimpleMeterRegistry();
        props = new ReportGuardProperties();
        limiter = new ReportRateLimiter(redis.template(), props, meterRegistry);
    }

    @AfterEach
    void tearDown() {
        redis.close();
    }

    @Test
    @DisplayName("사용자당 1시간 10회까지 통과, 11번째는 USER_LIMIT + 남은 시간")
    void userLimit() {
        for (int day = 0; day < 10; day++) {
            int offset = day;
            assertThatCode(() -> limiter.acquire(USER, ReportType.DAILY, DAY.minusDays(offset)))
                .doesNotThrowAnyException();
        }

        ReportRateLimitedException ex = catchThrowableOfType(ReportRateLimitedException.class,
            () -> limiter.acquire(USER, ReportType.WEEKLY, DAY));

        assertThat(ex.getReason()).isEqualTo(Reason.USER_LIMIT);
        assertThat(ex.getRetryAfterSeconds()).isBetween(3500L, 3600L);
        assertThat(ex.getMessage()).isEqualTo("AI 레포트를 너무 자주 만들었어요. 60분 뒤에 다시 시도해 주세요");
        assertThat(redis.template().getExpire("report:rate:" + USER)).isBetween(3500L, 3600L);
        assertThat(meterRegistry.counter(ReportGuardMetrics.REJECTED, "reason", "user_limit").count()).isEqualTo(1);
    }

    @Test
    @DisplayName("한도는 사용자별이다")
    void userLimit_perUser() {
        props.setUserLimit(1);
        limiter.acquire(USER, ReportType.DAILY, DAY);

        assertThatCode(() -> limiter.acquire("user-2", ReportType.DAILY, DAY)).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("window가 지나면 다시 통과한다")
    void userLimit_windowExpires() throws InterruptedException {
        props.setUserLimit(1);
        props.setUserWindow(Duration.ofMillis(300));
        limiter.acquire(USER, ReportType.DAILY, DAY);

        Thread.sleep(400);

        assertThatCode(() -> limiter.acquire(USER, ReportType.DAILY, DAY)).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("생성 성공 후 같은 기간은 30초 cooldown, 다른 기간은 영향 없음")
    void cooldown_samePeriodOnly() {
        limiter.acquire(USER, ReportType.DAILY, DAY);
        limiter.startCooldown(USER, ReportType.DAILY, DAY);

        ReportRateLimitedException ex = catchThrowableOfType(ReportRateLimitedException.class,
            () -> limiter.acquire(USER, ReportType.DAILY, DAY));

        assertThat(ex.getReason()).isEqualTo(Reason.COOLDOWN);
        assertThat(ex.getRetryAfterSeconds()).isBetween(29L, 30L);
        assertThat(meterRegistry.counter(ReportGuardMetrics.REJECTED, "reason", "cooldown").count()).isEqualTo(1);
        assertThatCode(() -> limiter.acquire(USER, ReportType.DAILY, DAY.plusDays(1))).doesNotThrowAnyException();
        assertThatCode(() -> limiter.acquire(USER, ReportType.WEEKLY, DAY)).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("cooldown으로 거절된 요청은 사용자 한도를 쓰지 않는다")
    void cooldown_doesNotConsumeUserLimit() {
        limiter.acquire(USER, ReportType.DAILY, DAY);
        limiter.startCooldown(USER, ReportType.DAILY, DAY);

        catchThrowableOfType(ReportRateLimitedException.class, () -> limiter.acquire(USER, ReportType.DAILY, DAY));

        assertThat(redis.template().opsForValue().get("report:rate:" + USER)).isEqualTo("1");
    }

    @Test
    @DisplayName("cooldown이 지나면 같은 기간도 다시 만들 수 있다")
    void cooldown_expires() throws InterruptedException {
        props.setCooldown(Duration.ofMillis(300));
        limiter.acquire(USER, ReportType.DAILY, DAY);
        limiter.startCooldown(USER, ReportType.DAILY, DAY);

        Thread.sleep(400);

        assertThatCode(() -> limiter.acquire(USER, ReportType.DAILY, DAY)).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("Redis에 연결할 수 없으면 fail-open: 제한 없이 통과하고 장애 지표를 남긴다")
    void redisDown_failOpen() {
        try (ReportRedisSupport.Connected down = ReportRedisSupport.unreachable()) {
            ReportRateLimiter downLimiter = new ReportRateLimiter(down.template(), props, meterRegistry);

            assertThatCode(() -> downLimiter.acquire(USER, ReportType.DAILY, DAY)).doesNotThrowAnyException();
            assertThatCode(() -> downLimiter.startCooldown(USER, ReportType.DAILY, DAY)).doesNotThrowAnyException();

            assertThat(meterRegistry.counter(ReportGuardMetrics.REDIS_FAILURE, "op", "rate_limit").count()).isEqualTo(1);
            assertThat(meterRegistry.counter(ReportGuardMetrics.REDIS_FAILURE, "op", "cooldown").count()).isEqualTo(1);
        }
    }
}
