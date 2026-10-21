package kr.io.flowmate.report.service;

import kr.io.flowmate.report.domain.Report;
import kr.io.flowmate.report.domain.ReportContent;
import kr.io.flowmate.report.domain.ReportType;
import kr.io.flowmate.report.dto.response.ReportResponse;
import kr.io.flowmate.report.repository.ReportRepository;
import kr.io.flowmate.support.Concurrently;
import kr.io.flowmate.support.Concurrently.Outcome;
import kr.io.flowmate.support.MySqlIntegrationTest;
import org.junit.jupiter.api.DisplayName;
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
 * 리포트 저장(같은 사용자, 타입, 기간이면 같은 행을 덮어쓴다)을 실제 MySQL 8.0에서 검증한다.
 */
@DisplayName("ReportPersistence (IT)")
class ReportPersistenceIT extends MySqlIntegrationTest {

    private static final int ROUNDS = 30;
    private static final int WRITERS = 4;
    private static final LocalDate DAY = LocalDate.parse("2026-05-28");

    @Autowired private ReportPersistence persistence;
    @Autowired private ReportRepository repository;
    @Autowired private JdbcTemplate jdbcTemplate;

    @Test
    @DisplayName("기존 row 없으면 INSERT")
    void insert_when_missing() {
        String userId = newUser();
        var result = new AiReportGenerator.Result(new ReportContent("k", "p", "t", "q?"), "daily.v2");

        ReportResponse resp = persistence.upsertAndFetch(userId, ReportType.DAILY, DAY, result);

        assertThat(resp.keep()).isEqualTo("k");
        assertThat(resp.tryAction()).isEqualTo("t");
        assertThat(resp.referenceQuestion()).isEqualTo("q?");
        assertThat(resp.createdAt()).isNotNull();
        assertThat(reportRowCount(userId)).isEqualTo(1);
    }

    @Test
    @DisplayName("기존 row 있으면 같은 row를 덮어쓴다 (id, createdAt 유지)")
    void update_when_exists() {
        String userId = newUser();
        var first = new AiReportGenerator.Result(new ReportContent("k1", "p1", "t1", null), "daily.v1");
        var second = new AiReportGenerator.Result(new ReportContent("k2", "p2", "t2", "q?"), "daily.v2");

        ReportResponse r1 = persistence.upsertAndFetch(userId, ReportType.DAILY, DAY, first);
        ReportResponse r2 = persistence.upsertAndFetch(userId, ReportType.DAILY, DAY, second);

        assertThat(r2.id()).isEqualTo(r1.id());
        assertThat(r2.createdAt()).isEqualTo(r1.createdAt());
        assertThat(r2.keep()).isEqualTo("k2");
        assertThat(r2.referenceQuestion()).isEqualTo("q?");
        assertThat(r2.promptVersion()).isEqualTo("daily.v2");
        assertThat(reportRowCount(userId)).isEqualTo(1);
    }

    @Test
    @DisplayName("content JSON은 엔티티(Hibernate)로 저장한 행과 같은 모양이다 (try 키, null 필드 포함)")
    void content_json_matches_entity_mapping() {
        var content = new ReportContent("k", "p", "t", null);
        String entityUser = newUser();
        repository.saveAndFlush(Report.create(entityUser, ReportType.DAILY, DAY, content, "daily.v2"));
        String upsertUser = newUser();

        persistence.upsertAndFetch(upsertUser, ReportType.DAILY, DAY,
            new AiReportGenerator.Result(content, "daily.v2"));

        assertThat(contentJson(upsertUser)).isEqualTo(contentJson(entityUser));
        assertThat(contentJson(upsertUser)).contains("\"try\": \"t\"", "\"referenceQuestion\": null");
    }

    @Test
    @DisplayName("엔티티로 저장된 기존 row도 같은 row로 덮어쓴다")
    void update_row_written_by_entity() {
        String userId = newUser();
        Report existing = repository.saveAndFlush(Report.create(userId, ReportType.DAILY, DAY,
            new ReportContent("k1", "p1", "t1", null), "daily.v1"));

        ReportResponse resp = persistence.upsertAndFetch(userId, ReportType.DAILY, DAY,
            new AiReportGenerator.Result(new ReportContent("k2", "p2", "t2", "q?"), "daily.v2"));

        assertThat(resp.id()).isEqualTo(existing.getId());
        assertThat(resp.tryAction()).isEqualTo("t2");
        assertThat(reportRowCount(userId)).isEqualTo(1);
    }

    @Test
    @DisplayName("같은 기간 리포트 동시 첫 저장은 모두 성공하고 row는 하나다")
    void concurrent_first_create() throws Exception {
        ExecutorService executor = Executors.newFixedThreadPool(WRITERS);
        try {
            List<String> failures = new ArrayList<>();
            for (int round = 0; round < ROUNDS; round++) {
                String userId = newUser();
                List<Callable<ReportResponse>> tasks = new ArrayList<>();
                for (int writer = 0; writer < WRITERS; writer++) {
                    var result = new AiReportGenerator.Result(
                        new ReportContent("keep-" + writer, "p", "t", null), "daily.v2");
                    tasks.add(() -> persistence.upsertAndFetch(userId, ReportType.DAILY, DAY, result));
                }

                List<Outcome<ReportResponse>> outcomes = Concurrently.run(executor, tasks);

                failures.addAll(Concurrently.failures(outcomes));
                assertThat(reportRowCount(userId)).as("round %d", round).isEqualTo(1);
                String id = jdbcTemplate.queryForObject(
                    "select id from reports where user_id = ?", String.class, userId);
                assertThat(Concurrently.values(outcomes)).as("round %d", round)
                    .extracting(ReportResponse::id)
                    .containsOnly(id);
            }
            System.out.printf("[report first-create] attempts=%d failures=%d %s%n",
                ROUNDS * WRITERS, failures.size(), failures);
            assertThat(failures).isEmpty();
        } finally {
            executor.shutdownNow();
        }
    }

    private String contentJson(String userId) {
        return jdbcTemplate.queryForObject(
            "select cast(content as char) from reports where user_id = ?", String.class, userId);
    }

    private int reportRowCount(String userId) {
        return jdbcTemplate.queryForObject(
            "select count(*) from reports where user_id = ?", Integer.class, userId);
    }

    private static String newUser() {
        return "it-" + UUID.randomUUID().toString().substring(0, 8);
    }
}
