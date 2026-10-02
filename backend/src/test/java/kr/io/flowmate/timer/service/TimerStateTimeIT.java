package kr.io.flowmate.timer.service;

import kr.io.flowmate.support.MySqlIntegrationTest;
import kr.io.flowmate.timer.domain.TimerState;
import kr.io.flowmate.timer.repository.TimerStateRepository;
import kr.io.flowmate.todo.domain.Todo;
import kr.io.flowmate.todo.repository.TodoRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 애플리케이션이 바인딩한 시각의 왕복과 24시간 논리 TTL 경계를 실제 MySQL 8.0에서 검증한다.
 * 시각은 모두 애플리케이션 값으로 바인딩한다. 이 테스트는 "앱 바인딩 경로끼리 일관된다"를 증명하며,
 * DB에 저장된 절대 UTC 값의 정확성이나 운영 DB 시간대까지 증명하지는 않는다.
 */
class TimerStateTimeIT extends MySqlIntegrationTest {

    private static final String RUNNING_JSON = "{\"status\":\"running\"}";

    @Autowired
    private TimerStateRepository timerStateRepository;

    @Autowired
    private TodoRepository todoRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @Test
    void 바인딩한_밀리초_시각이_그대로_저장되고_읽힌다() {
        String userId = newUser();
        String todoId = newTodo(userId);
        Instant first = Instant.parse("2026-10-02T03:04:05.678Z");
        Instant later = first.plus(90, ChronoUnit.MINUTES);

        upsertAt(todoId, userId, RUNNING_JSON, first);
        TimerState created = timerStateRepository.findById(todoId).orElseThrow();
        assertThat(created.getCreatedAt()).isEqualTo(first);
        assertThat(created.getUpdatedAt()).isEqualTo(first);

        upsertAt(todoId, userId, null, later);
        TimerState updated = timerStateRepository.findById(todoId).orElseThrow();
        assertThat(updated.getCreatedAt()).isEqualTo(first);
        assertThat(updated.getUpdatedAt()).isEqualTo(later);
    }

    @Test
    void 밀리초_미만은_밀리초_단위로_정리되어_저장된다() {
        // 서비스는 밀리초로 맞춰 바인딩하므로 운영에서는 이 경로를 타지 않는다. MySQL의 처리 방식을 기록하는 테스트다
        String userId = newUser();
        String todoId = newTodo(userId);
        Instant subMillis = Instant.parse("2026-10-02T03:04:05.678900Z");

        upsertAt(todoId, userId, RUNNING_JSON, subMillis);

        Instant stored = timerStateRepository.findById(todoId).orElseThrow().getUpdatedAt();
        assertThat(stored.getNano() % 1_000_000).isZero();
        Instant truncated = subMillis.truncatedTo(ChronoUnit.MILLIS);
        assertThat(stored).isBetween(truncated, truncated.plusMillis(1));
    }

    @Test
    void 활성_조회는_기준_시각과_같거나_이후에_갱신된_비idle_행만_최신순으로_돌려준다() {
        String userId = newUser();
        Instant threshold = Instant.parse("2026-10-01T00:00:00.000Z");
        String atThreshold = newTimerAt(userId, RUNNING_JSON, threshold);
        newTimerAt(userId, RUNNING_JSON, threshold.minusMillis(1));                         // 기준 1ms 전 → 제외
        String justAfter = newTimerAt(userId, RUNNING_JSON, threshold.plusMillis(1));
        String hourAfter = newTimerAt(userId, RUNNING_JSON, threshold.plus(1, ChronoUnit.HOURS));   // "23시간 전"
        newTimerAt(userId, RUNNING_JSON, threshold.minus(1, ChronoUnit.HOURS));            // "25시간 전" → 제외
        newTimerAt(userId, null, threshold.plus(1, ChronoUnit.HOURS));                     // idle → 제외

        assertThat(timerStateRepository.findActiveSince(userId, threshold))
                .extracting(TimerState::getTodoId)
                .containsExactly(hourAfter, justAfter, atThreshold);
    }

    @Test
    void 시간대_설정을_기록하고_현재_시각_왕복을_검증한다() {
        Map<String, Object> tz = jdbcTemplate.queryForMap(
                "select @@session.time_zone as session_tz, @@global.time_zone as global_tz");
        String recorded = "session_tz=" + tz.get("session_tz") + ", global_tz=" + tz.get("global_tz");
        System.out.println("[timezone] " + recorded);
        String userId = newUser();
        String todoId = newTodo(userId);
        Instant now = Instant.now().truncatedTo(ChronoUnit.MILLIS);

        upsertAt(todoId, userId, RUNNING_JSON, now);

        assertThat(timerStateRepository.findById(todoId).orElseThrow().getUpdatedAt())
                .as(recorded)
                .isEqualTo(now);
    }

    private String newTimerAt(String userId, String stateJson, Instant updatedAt) {
        String todoId = newTodo(userId);
        upsertAt(todoId, userId, stateJson, updatedAt);
        return todoId;
    }

    private void upsertAt(String todoId, String userId, String stateJson, Instant now) {
        new TransactionTemplate(transactionManager)
                .executeWithoutResult(status -> timerStateRepository.upsert(todoId, userId, stateJson, now));
    }

    private String newTodo(String userId) {
        return todoRepository.save(Todo.create(userId, "timer-it", null, LocalDate.now(), 0, 0)).getId();
    }

    private static String newUser() {
        return "it-" + UUID.randomUUID().toString().substring(0, 8);
    }
}
