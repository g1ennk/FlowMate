package kr.io.flowmate.review.service;

import kr.io.flowmate.review.dto.request.ReviewUpsertRequest;
import kr.io.flowmate.review.dto.response.ReviewResponse;
import kr.io.flowmate.support.Concurrently;
import kr.io.flowmate.support.Concurrently.Outcome;
import kr.io.flowmate.support.MySqlIntegrationTest;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 같은 회고(user_id, type, period_start)의 동시 저장을 실제 MySQL 8.0에서 검증한다.
 * 4건을 CyclicBarrier로 동시에 출발시키는 라운드를 30번 반복한다.
 */
class ReviewConcurrencyIT extends MySqlIntegrationTest {

    private static final int ROUNDS = 30;
    private static final int WRITERS = 4;
    private static final LocalDate MONDAY = LocalDate.of(2026, 2, 16);

    private static ExecutorService executor;

    @Autowired
    private ReviewService reviewService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeAll
    static void startExecutor() {
        executor = Executors.newFixedThreadPool(WRITERS);
    }

    @AfterAll
    static void stopExecutor() {
        executor.shutdownNow();
    }

    @Test
    void 같은_회고_동시_첫_저장은_모두_성공하고_행은_하나다() throws Exception {
        List<String> failures = new ArrayList<>();
        for (int round = 0; round < ROUNDS; round++) {
            String userId = newUser();

            List<Outcome<ReviewResponse>> outcomes = Concurrently.run(executor, upsertTasks(userId));

            failures.addAll(Concurrently.failures(outcomes));
            assertThat(reviewRowCount(userId)).as("round %d", round).isEqualTo(1);
            assertSameRowAndLastWriteSaved(userId, outcomes, round);
        }
        System.out.printf("[review first-create] attempts=%d failures=%d %s%n",
                ROUNDS * WRITERS, failures.size(), failures);
        assertThat(failures).isEmpty();
    }

    @Test
    void 기존_회고_동시_갱신도_모두_성공하고_행은_하나다() throws Exception {
        List<String> failures = new ArrayList<>();
        for (int round = 0; round < ROUNDS; round++) {
            String userId = newUser();
            String id = reviewService.upsertReview(userId, request("기존")).id();

            List<Outcome<ReviewResponse>> outcomes = Concurrently.run(executor, upsertTasks(userId));

            failures.addAll(Concurrently.failures(outcomes));
            assertThat(reviewRowCount(userId)).as("round %d", round).isEqualTo(1);
            assertThat(Concurrently.values(outcomes)).as("round %d", round)
                    .extracting(ReviewResponse::id)
                    .containsOnly(id);
        }
        System.out.printf("[review update] attempts=%d failures=%d %s%n",
                ROUNDS * WRITERS, failures.size(), failures);
        assertThat(failures).isEmpty();
    }

    private void assertSameRowAndLastWriteSaved(String userId, List<Outcome<ReviewResponse>> outcomes, int round) {
        List<ReviewResponse> saved = Concurrently.values(outcomes);
        if (saved.isEmpty()) {
            return;
        }
        String id = jdbcTemplate.queryForObject(
                "select id from reviews where user_id = ?", String.class, userId);
        String content = jdbcTemplate.queryForObject(
                "select content from reviews where user_id = ?", String.class, userId);
        assertThat(saved).as("round %d", round).extracting(ReviewResponse::id).containsOnly(id);
        assertThat(saved).as("round %d", round).extracting(ReviewResponse::content).contains(content);
    }

    private List<Callable<ReviewResponse>> upsertTasks(String userId) {
        List<Callable<ReviewResponse>> tasks = new ArrayList<>();
        for (int writer = 0; writer < WRITERS; writer++) {
            ReviewUpsertRequest body = request("writer-" + writer);
            tasks.add(() -> reviewService.upsertReview(userId, body));
        }
        return tasks;
    }

    private int reviewRowCount(String userId) {
        return jdbcTemplate.queryForObject(
                "select count(*) from reviews where user_id = ?", Integer.class, userId);
    }

    private static ReviewUpsertRequest request(String content) {
        ReviewUpsertRequest request = new ReviewUpsertRequest();
        request.setType("daily");
        request.setPeriodStart(MONDAY);
        request.setPeriodEnd(MONDAY);
        request.setContent(content);
        return request;
    }

    private static String newUser() {
        return "it-" + UUID.randomUUID().toString().substring(0, 8);
    }
}
