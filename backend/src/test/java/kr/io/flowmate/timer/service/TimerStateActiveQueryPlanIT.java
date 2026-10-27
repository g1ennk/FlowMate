package kr.io.flowmate.timer.service;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.sql.Date;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 복원 조회(findActiveSince)가 기존 (user_id, updated_at DESC) 인덱스만으로 충분한지 실제 MySQL 8.0에서 확인한다.
 * 사용자 한 명이 오래 써서 행이 쌓인 상황을 가정한다. 행은 Todo당 하나이고 지우지 않으므로 대부분은 idle이나 stale이다.
 * <p>
 * 확인하는 것: 인덱스 range scan으로 24시간 밖의 행을 건너뛰는지, 정렬을 인덱스 순서로 처리하는지(filesort 없음),
 * 실제로 읽는 행이 "24시간 안에 갱신된 행"으로 줄어드는지. 실행 시간은 참고용으로 출력만 한다.
 */
class TimerStateActiveQueryPlanIT extends TimerIntegrationTest {

    private static final String RUNNING_JSON = "{\"status\":\"running\"}";
    private static final String INDEX = "idx_timer_states_user";

    // 대상 사용자의 행 구성. stale은 시간대 해석 차이(±9시간)에도 경계를 넘지 않게 48시간 이상 전으로 둔다
    private static final int ACTIVE = 3;          // 24시간 안, 진행 중
    private static final int IDLE_RECENT = 12;    // 24시간 안, idle(state_json NULL)
    private static final int STALE = 20;          // 2~20일 전, 진행 중인 채로 방치
    private static final int IDLE_OLD = 465;      // 2~700일 전, idle
    private static final int TARGET_ROWS = ACTIVE + IDLE_RECENT + STALE + IDLE_OLD;

    private static final int OTHER_USERS = 99;
    private static final int ROWS_PER_OTHER_USER = 100;

    private static final String ACTIVE_SQL = """
            SELECT todo_id, user_id, state_json, version, created_at, updated_at
            FROM timer_states
            WHERE user_id = ? AND state_json IS NOT NULL AND updated_at >= ?
            ORDER BY updated_at DESC
            """;

    // Phase A 이전 방식: 사용자 행을 전부 읽은 뒤 애플리케이션에서 걸렀다
    private static final String BEFORE_SQL = """
            SELECT todo_id, user_id, state_json, version, created_at, updated_at
            FROM timer_states
            WHERE user_id = ?
            """;

    private static final Pattern INDEX_SCAN_ACTUAL_ROWS =
            Pattern.compile("Index (?:range scan|lookup) on timer_states using " + INDEX
                    + ".*?\\(actual time=[^)]*?rows=(\\d+)");

    @Autowired
    private TimerService timerService;

    @Test
    void 활성_조회는_기존_인덱스_range_scan으로_24시간_안의_행만_읽는다() {
        Instant now = Instant.now().truncatedTo(ChronoUnit.MILLIS);
        String target = newUser();
        seedTargetUser(target, now);
        for (int i = 0; i < OTHER_USERS; i++) {
            seedOtherUser(newUser(), now);
        }
        jdbcTemplate.execute("ANALYZE TABLE timer_states");
        Timestamp threshold = Timestamp.from(now.minus(24, ChronoUnit.HOURS));

        Map<String, Object> plan = jdbcTemplate.queryForMap("EXPLAIN " + ACTIVE_SQL, target, threshold);
        String analyze = explainAnalyze(ACTIVE_SQL, target, threshold);
        String beforeAnalyze = explainAnalyze(BEFORE_SQL, target);
        System.out.println("[explain] " + plan);
        System.out.println("[explain analyze] " + analyze);
        System.out.println("[explain analyze before] " + beforeAnalyze);
        System.out.println("[latency after] " + latency(ACTIVE_SQL, target, threshold));
        System.out.println("[latency before] " + latency(BEFORE_SQL, target));

        assertThat(plan.get("key")).isEqualTo(INDEX);
        assertThat(plan.get("type")).isEqualTo("range");
        assertThat(String.valueOf(plan.get("Extra"))).doesNotContain("filesort");
        // 인덱스에서 읽는 행은 24시간 안에 갱신된 행뿐이다. 그중 idle은 행을 확인한 뒤 걸러진다
        assertThat(indexScanActualRows(analyze)).isEqualTo(ACTIVE + IDLE_RECENT);
        assertThat(indexScanActualRows(beforeAnalyze)).isEqualTo(TARGET_ROWS);
    }

    @Test
    void 활성_복원은_진행_중인_행만_돌려주고_idle과_stale_행을_지우지_않는다() {
        Instant now = Instant.now().truncatedTo(ChronoUnit.MILLIS);
        String target = newUser();
        String otherUser = newUser();
        seedTargetUser(target, now);
        seedOtherUser(otherUser, now);

        assertThat(timerService.getActiveStates(target)).hasSize(ACTIVE);
        assertThat(timerService.getActiveStates(otherUser)).hasSize(1);
        assertThat(userRowCount(target)).isEqualTo(TARGET_ROWS);
    }

    private void seedTargetUser(String userId, Instant now) {
        List<Object[]> rows = new ArrayList<>();
        for (int i = 0; i < ACTIVE; i++) {
            rows.add(row(userId, RUNNING_JSON, now.minus(i + 1, ChronoUnit.HOURS)));
        }
        for (int i = 0; i < IDLE_RECENT; i++) {
            rows.add(row(userId, null, now.minus(i + 1, ChronoUnit.HOURS).minus(30, ChronoUnit.MINUTES)));
        }
        for (int i = 0; i < STALE; i++) {
            rows.add(row(userId, RUNNING_JSON, now.minus(2 + i % 19, ChronoUnit.DAYS)));
        }
        for (int i = 0; i < IDLE_OLD; i++) {
            rows.add(row(userId, null, now.minus(2 + i % 699, ChronoUnit.DAYS)));
        }
        insertAll(rows);
    }

    // 다른 사용자: 진행 중 1, 최근 idle 4, stale 5, 오래된 idle 90
    private void seedOtherUser(String userId, Instant now) {
        List<Object[]> rows = new ArrayList<>();
        rows.add(row(userId, RUNNING_JSON, now.minus(2, ChronoUnit.HOURS)));
        for (int i = 0; i < 4; i++) {
            rows.add(row(userId, null, now.minus(i + 3, ChronoUnit.HOURS)));
        }
        for (int i = 0; i < 5; i++) {
            rows.add(row(userId, RUNNING_JSON, now.minus(3 + i, ChronoUnit.DAYS)));
        }
        for (int i = 0; i < ROWS_PER_OTHER_USER - 10; i++) {
            rows.add(row(userId, null, now.minus(2 + i * 7L, ChronoUnit.DAYS)));
        }
        insertAll(rows);
    }

    private static Object[] row(String userId, String stateJson, Instant updatedAt) {
        return new Object[]{UUID.randomUUID().toString(), userId, stateJson, Timestamp.from(updatedAt)};
    }

    // 행 수가 많아 여러 행 INSERT 한 문장으로 넣는다. 부모 todos 행이 먼저 있어야 FK를 통과한다
    private void insertAll(List<Object[]> rows) {
        String todoValues = String.join(",", Collections.nCopies(rows.size(), "(?, ?, 'plan-it', ?)"));
        List<Object> todoArgs = new ArrayList<>();
        Object today = Date.valueOf(LocalDate.now());
        for (Object[] r : rows) {
            todoArgs.addAll(Arrays.asList(r[0], r[1], today));
        }
        jdbcTemplate.update("INSERT INTO todos (id, user_id, title, date) VALUES " + todoValues, todoArgs.toArray());

        String timerValues = String.join(",", Collections.nCopies(rows.size(), "(?, ?, ?, 1, ?, ?)"));
        List<Object> timerArgs = new ArrayList<>();
        for (Object[] r : rows) {
            timerArgs.addAll(Arrays.asList(r[0], r[1], r[2], r[3], r[3]));
        }
        jdbcTemplate.update("INSERT INTO timer_states (todo_id, user_id, state_json, version, created_at, updated_at) VALUES "
                + timerValues, timerArgs.toArray());
    }

    private String explainAnalyze(String sql, Object... args) {
        return jdbcTemplate.queryForObject("EXPLAIN ANALYZE " + sql, String.class, args);
    }

    private static int indexScanActualRows(String analyze) {
        Matcher matcher = INDEX_SCAN_ACTUAL_ROWS.matcher(analyze.replace('\n', ' '));
        assertThat(matcher.find()).as("EXPLAIN ANALYZE에 %s 인덱스 스캔이 있어야 한다: %s", INDEX, analyze).isTrue();
        return Integer.parseInt(matcher.group(1));
    }

    private String latency(String sql, Object... args) {
        for (int i = 0; i < 50; i++) {
            jdbcTemplate.queryForList(sql, args);
        }
        long[] nanos = new long[300];
        for (int i = 0; i < nanos.length; i++) {
            long start = System.nanoTime();
            jdbcTemplate.queryForList(sql, args);
            nanos[i] = System.nanoTime() - start;
        }
        Arrays.sort(nanos);
        return "p50=%.2fms p95=%.2fms p99=%.2fms".formatted(
                percentileMs(nanos, 0.50), percentileMs(nanos, 0.95), percentileMs(nanos, 0.99));
    }

    private static double percentileMs(long[] sorted, double p) {
        return sorted[(int) Math.ceil(p * sorted.length) - 1] / 1_000_000.0;
    }

    private int userRowCount(String userId) {
        return jdbcTemplate.queryForObject("select count(*) from timer_states where user_id = ?", Integer.class, userId);
    }
}
