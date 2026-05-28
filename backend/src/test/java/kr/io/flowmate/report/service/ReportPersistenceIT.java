package kr.io.flowmate.report.service;

import kr.io.flowmate.config.JpaAuditingConfig;
import kr.io.flowmate.report.domain.ReportContent;
import kr.io.flowmate.report.domain.ReportType;
import kr.io.flowmate.report.dto.response.ReportResponse;
import kr.io.flowmate.report.repository.ReportRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@TestPropertySource(properties = {
    "spring.datasource.url=jdbc:h2:mem:reports;MODE=MySQL;DB_CLOSE_DELAY=-1",
    "spring.jpa.hibernate.ddl-auto=create-drop",
    "spring.flyway.enabled=false"
})
@Import({ReportPersistence.class, JpaAuditingConfig.class})
@DisplayName("ReportPersistence (IT)")
class ReportPersistenceIT {

    @Autowired private ReportRepository repository;
    @Autowired private ReportPersistence persistence;

    @Test
    @DisplayName("기존 row 없으면 INSERT")
    void insert_when_missing() {
        var result = new AiReportGenerator.Result(new ReportContent("k","p","t","q?"), "daily.v2");

        ReportResponse resp = persistence.upsertAndFetch("user-1", ReportType.DAILY,
            LocalDate.parse("2026-05-28"), result);

        assertThat(resp.keep()).isEqualTo("k");
        assertThat(repository.count()).isEqualTo(1);
    }

    @Test
    @DisplayName("기존 row 있으면 dirty checking으로 UPDATE")
    void update_when_exists() {
        var first = new AiReportGenerator.Result(new ReportContent("k1","p1","t1",null), "daily.v1");
        var second = new AiReportGenerator.Result(new ReportContent("k2","p2","t2","q?"), "daily.v2");

        ReportResponse r1 = persistence.upsertAndFetch("user-1", ReportType.DAILY,
            LocalDate.parse("2026-05-28"), first);
        ReportResponse r2 = persistence.upsertAndFetch("user-1", ReportType.DAILY,
            LocalDate.parse("2026-05-28"), second);

        assertThat(r2.id()).isEqualTo(r1.id());
        assertThat(r2.keep()).isEqualTo("k2");
        assertThat(r2.promptVersion()).isEqualTo("daily.v2");
        assertThat(repository.count()).isEqualTo(1);
    }
}
