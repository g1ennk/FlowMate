package kr.io.flowmate.report.service;

import io.micrometer.core.instrument.MeterRegistry;
import kr.io.flowmate.report.config.ReportGuardProperties;
import kr.io.flowmate.report.domain.ReportType;
import kr.io.flowmate.report.exception.ReportRateLimitedException;
import kr.io.flowmate.report.exception.ReportRateLimitedException.Reason;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.List;

/**
 * 사용자 연타와 자동 재시도로 Gemini 비용이 새지 않게 막는다.
 * <ul>
 *   <li>사용자당: 첫 요청부터 1시간 고정 window 안에서 10회. Gemini를 부른 시도는 실패해도 센다</li>
 *   <li>같은 (type, periodStart): 생성에 성공한 뒤 30초 cooldown</li>
 * </ul>
 * Redis 장애 시에는 fail-open이다. 제한 없이 진행하고, 남는 방어선은 Gemini 자체 quota(429 AI_QUOTA_EXCEEDED)다.
 */
@Slf4j
@Component
public class ReportRateLimiter {

    static final String USER_KEY_PREFIX = "report:rate:";
    static final String COOLDOWN_KEY_PREFIX = "report:cooldown:";

    /**
     * KEYS[1]=사용자 카운터, KEYS[2]=기간 cooldown, ARGV[1]=limit, ARGV[2]=window(ms).
     * 반환 {0, 0}=통과(카운터 +1), {1, ttl}=사용자 한도 초과, {2, ttl}=cooldown 중. 확인과 증가를 원자적으로 한다.
     */
    private static final RedisScript<List> CHECK_SCRIPT = RedisScript.of("""
        local cooldown = redis.call('PTTL', KEYS[2])
        if cooldown > 0 then return {2, cooldown} end
        local count = tonumber(redis.call('GET', KEYS[1]) or '0')
        if count >= tonumber(ARGV[1]) then
          local ttl = redis.call('PTTL', KEYS[1])
          if ttl < 0 then
            redis.call('PEXPIRE', KEYS[1], ARGV[2])
            ttl = tonumber(ARGV[2])
          end
          return {1, ttl}
        end
        if redis.call('INCR', KEYS[1]) == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[2]) end
        return {0, 0}
        """, List.class);

    private final StringRedisTemplate redis;
    private final ReportGuardProperties props;
    private final MeterRegistry meterRegistry;

    public ReportRateLimiter(StringRedisTemplate redis, ReportGuardProperties props, MeterRegistry meterRegistry) {
        this.redis = redis;
        this.props = props;
        this.meterRegistry = meterRegistry;
    }

    /**
     * Gemini 호출 직전에 부른다. 통과하면 사용자 카운터를 1 올린다.
     * @throws ReportRateLimitedException 사용자 한도 초과 또는 cooldown 중
     */
    public void acquire(String userId, ReportType type, LocalDate periodStart) {
        List<?> result;
        try {
            result = redis.execute(CHECK_SCRIPT,
                List.of(USER_KEY_PREFIX + userId, cooldownKey(userId, type, periodStart)),
                String.valueOf(props.getUserLimit()),
                String.valueOf(props.getUserWindow().toMillis()));
        } catch (DataAccessException e) {
            log.warn("Report rate limit unavailable, allowing request: {}", e.getMessage());
            ReportGuardMetrics.redisFailure(meterRegistry, "rate_limit");
            return;
        }
        if (result == null || result.size() < 2) {
            return;
        }
        long code = ((Number) result.get(0)).longValue();
        long retryAfterSeconds = Math.max(1, (((Number) result.get(1)).longValue() + 999) / 1000);
        if (code == 1) {
            ReportGuardMetrics.rejected(meterRegistry, "user_limit");
            throw new ReportRateLimitedException(Reason.USER_LIMIT, retryAfterSeconds);
        }
        if (code == 2) {
            ReportGuardMetrics.rejected(meterRegistry, "cooldown");
            throw new ReportRateLimitedException(Reason.COOLDOWN, retryAfterSeconds);
        }
    }

    /** 생성과 저장이 성공한 뒤에 부른다. 실패한 생성은 바로 다시 시도할 수 있어야 하므로 cooldown을 걸지 않는다 */
    public void startCooldown(String userId, ReportType type, LocalDate periodStart) {
        try {
            redis.opsForValue().set(cooldownKey(userId, type, periodStart), "1", props.getCooldown());
        } catch (DataAccessException e) {
            log.warn("Report cooldown not recorded: {}", e.getMessage());
            ReportGuardMetrics.redisFailure(meterRegistry, "cooldown");
        }
    }

    private static String cooldownKey(String userId, ReportType type, LocalDate periodStart) {
        return COOLDOWN_KEY_PREFIX + userId + ":" + type + ":" + periodStart;
    }
}
