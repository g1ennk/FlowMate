package kr.io.flowmate.timer.service;

import kr.io.flowmate.timer.dto.request.TimerStatePushRequest;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 서로 다른 Todo의 동시 첫 저장에서 gap lock deadlock이 생기는 조건을 검증한다.
 * Todo id는 UUID(16진수)보다 뒤에 정렬되는 "zz-" 접두사로 만들어 항상 같은 gap에 들어가게 한다.
 */
class TimerGapLockDeadlockIT extends TimerIntegrationTest {

    private static final int ROUNDS = 10;
    private static final String USER_ID = "gap-user";

    private static ExecutorService executor;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @Autowired
    private TimerService timerService;

    @BeforeAll
    static void startExecutor() {
        executor = Executors.newFixedThreadPool(4);
    }

    @AfterAll
    static void stopExecutor() {
        executor.shutdownNow();
    }

    @Test
    void 과거_경로_SELECT_FOR_UPDATE_후_INSERT는_서로_다른_Todo에서도_deadlock이_난다() throws Exception {
        Map<String, Integer> outcomes = firstSaveTwoTodos("lock", true);

        assertThat(outcomes)
                .as("%d라운드 × 2트랜잭션, SELECT FOR UPDATE → (둘 다 조회 완료) → INSERT", ROUNDS)
                .containsEntry("DEADLOCK(1213)", ROUNDS)
                .containsEntry("OK", ROUNDS);
    }

    @Test
    void 직전_경로_잠금없는_SELECT_후_INSERT는_같은_순서로_끼어들어도_deadlock이_없다() throws Exception {
        Map<String, Integer> outcomes = firstSaveTwoTodos("plain", false);

        assertThat(outcomes)
                .as("%d라운드 × 2트랜잭션, SELECT → (둘 다 조회 완료) → INSERT", ROUNDS)
                .containsExactly(Map.entry("OK", ROUNDS * 2));
    }

    @Test
    void 현재_TimerService는_서로_다른_Todo_동시_첫_저장에서_모두_성공한다() throws Exception {
        int threads = 4;
        Map<String, Integer> outcomes = new TreeMap<>();

        for (int round = 0; round < 30; round++) {
            CyclicBarrier barrier = new CyclicBarrier(threads);
            List<Future<String>> futures = new ArrayList<>();
            for (int i = 0; i < threads; i++) {
                String todoId = newTodoInGap("svc-%02d-%d".formatted(round, i));
                futures.add(executor.submit(() -> {
                    barrier.await(5, TimeUnit.SECONDS);
                    try {
                        timerService.upsertState(USER_ID, todoId, running());
                        return "OK";
                    } catch (RuntimeException e) {
                        return classify(e);
                    }
                }));
            }
            for (Future<String> future : futures) {
                outcomes.merge(future.get(), 1, Integer::sum);
            }
        }

        assertThat(outcomes).containsExactly(Map.entry("OK", 30 * threads));
    }

    /**
     * 두 트랜잭션이 서로 다른 Todo에 대해 조회를 모두 마친 뒤에 INSERT하도록 순서를 강제한다.
     * 과거 코드(@Lock(PESSIMISTIC_WRITE))가 Hibernate로 실행하던 SQL을 네이티브로 재연한다.
     */
    private Map<String, Integer> firstSaveTwoTodos(String prefix, boolean forUpdate) throws Exception {
        Map<String, Integer> outcomes = new TreeMap<>();
        String select = "select todo_id from timer_states where user_id = ? and todo_id = ?"
                + (forUpdate ? " for update" : "");

        for (int round = 0; round < ROUNDS; round++) {
            CyclicBarrier bothSelected = new CyclicBarrier(2);
            List<Future<String>> futures = new ArrayList<>();
            for (String suffix : List.of("a", "b")) {
                String todoId = newTodoInGap("%s-%02d-%s".formatted(prefix, round, suffix));
                futures.add(executor.submit(() -> {
                    try {
                        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
                            jdbcTemplate.queryForList(select, USER_ID, todoId);
                            await(bothSelected);
                            jdbcTemplate.update(
                                    "insert into timer_states (todo_id, user_id, state_json, version, created_at, updated_at) "
                                            + "values (?, ?, '{}', 1, now(3), now(3))", todoId, USER_ID);
                        });
                        return "OK";
                    } catch (RuntimeException e) {
                        return classify(e);
                    }
                }));
            }
            for (Future<String> future : futures) {
                outcomes.merge(future.get(), 1, Integer::sum);
            }
        }
        return outcomes;
    }

    private String newTodoInGap(String key) {
        String todoId = "zz-" + key;
        jdbcTemplate.update("insert into todos (id, user_id, title, date) values (?, ?, 'gap', curdate())",
                todoId, USER_ID);
        return todoId;
    }

    private static void await(CyclicBarrier barrier) {
        try {
            barrier.await(5, TimeUnit.SECONDS);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static TimerStatePushRequest running() {
        TimerStatePushRequest request = new TimerStatePushRequest();
        request.setStatus("running");
        request.setState(Map.of("status", "running"));
        return request;
    }
}
