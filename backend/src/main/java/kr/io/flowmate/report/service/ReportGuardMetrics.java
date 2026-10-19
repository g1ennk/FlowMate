package kr.io.flowmate.report.service;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;

/** 리포트 생성 보호 장치의 거절과 Redis 장애를 센다. 태그 값은 고정 문자열뿐이다 */
final class ReportGuardMetrics {

    static final String REJECTED = "report.generate.rejected";
    static final String REDIS_FAILURE = "report.guard.redis.failure";

    private ReportGuardMetrics() {
    }

    /** reason: in_progress, hourly_limit, cooldown */
    static void rejected(MeterRegistry registry, String reason) {
        Counter.builder(REJECTED)
            .description("Gemini 호출 전에 거절한 리포트 생성 요청")
            .tag("reason", reason)
            .register(registry)
            .increment();
    }

    /** op: lock_acquire, lock_release, rate_limit, cooldown */
    static void redisFailure(MeterRegistry registry, String op) {
        Counter.builder(REDIS_FAILURE)
            .description("Redis 장애로 fail-open 처리한 리포트 보호 장치 호출")
            .tag("op", op)
            .register(registry)
            .increment();
    }
}
