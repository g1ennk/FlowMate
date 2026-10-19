package kr.io.flowmate.report.service;

import io.micrometer.core.instrument.MeterRegistry;
import kr.io.flowmate.report.config.ReportGuardProperties;
import kr.io.flowmate.report.domain.ReportType;
import kr.io.flowmate.report.exception.ReportGenerationInProgressException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * 같은 리포트를 동시에 생성해 Gemini를 두 번 호출하지 않도록 막는 Redis lock.
 *
 * <p>Redis 장애 시에는 fail-open이다. lock 없이 생성을 진행하고, 정합성은 reports의
 * (user_id, type, period_start) UNIQUE와 upsert가 지킨다. 장애 중 잃는 것은 중복 호출 방지뿐이다.
 */
@Slf4j
@Component
public class ReportGenerationLock {

    static final String KEY_PREFIX = "report:generate:";

    /** 내가 건 lock일 때만 지운다. TTL이 지나 다른 요청이 새로 건 lock을 지우지 않기 위해서다 */
    private static final RedisScript<Long> RELEASE_SCRIPT = RedisScript.of(
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
        Long.class);

    private final StringRedisTemplate redis;
    private final ReportGuardProperties props;
    private final MeterRegistry meterRegistry;

    public ReportGenerationLock(StringRedisTemplate redis, ReportGuardProperties props, MeterRegistry meterRegistry) {
        this.redis = redis;
        this.props = props;
        this.meterRegistry = meterRegistry;
    }

    /**
     * @throws ReportGenerationInProgressException 다른 요청이 lock을 갖고 있을 때
     * @return 획득한 lock. Redis 장애로 lock 없이 진행하면 {@link Handle#bypassed()}가 true다
     */
    public Handle acquire(String userId, ReportType type, LocalDate periodStart) {
        String key = KEY_PREFIX + userId + ":" + type + ":" + periodStart;
        String token = UUID.randomUUID().toString();
        Boolean acquired;
        try {
            acquired = redis.opsForValue().setIfAbsent(key, token, props.getLockTtl());
        } catch (DataAccessException e) {
            log.warn("Report lock unavailable, proceeding without lock: {}", e.getMessage());
            ReportGuardMetrics.redisFailure(meterRegistry, "lock_acquire");
            return Handle.BYPASSED;
        }
        if (!Boolean.TRUE.equals(acquired)) {
            ReportGuardMetrics.rejected(meterRegistry, "in_progress");
            throw new ReportGenerationInProgressException();
        }
        return new Handle(key, token);
    }

    /** 해제 실패는 무시한다. lock은 TTL이 지나면 사라진다 */
    public void release(Handle handle) {
        if (handle == null || handle.bypassed()) {
            return;
        }
        try {
            redis.execute(RELEASE_SCRIPT, List.of(handle.key()), handle.token());
        } catch (DataAccessException e) {
            log.warn("Report lock release failed, will expire by TTL: {}", e.getMessage());
            ReportGuardMetrics.redisFailure(meterRegistry, "lock_release");
        }
    }

    public record Handle(String key, String token) {
        public static final Handle BYPASSED = new Handle(null, null);

        public boolean bypassed() {
            return token == null;
        }
    }
}
