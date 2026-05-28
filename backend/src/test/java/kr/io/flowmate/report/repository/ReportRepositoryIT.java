package kr.io.flowmate.report.repository;

import kr.io.flowmate.config.JpaAuditingConfig;
import kr.io.flowmate.report.domain.Report;
import kr.io.flowmate.report.domain.ReportContent;
import kr.io.flowmate.report.domain.ReportType;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;

import java.time.LocalDate;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@TestPropertySource(properties = {
    "spring.datasource.url=jdbc:h2:mem:reports;MODE=MySQL;DB_CLOSE_DELAY=-1",
    "spring.jpa.hibernate.ddl-auto=create-drop",
    "spring.flyway.enabled=false"
})
@Import({JpaAuditingConfig.class})
@DisplayName("ReportRepository (IT)")
class ReportRepositoryIT {

    @Autowired
    private ReportRepository repository;

    @Test
    @DisplayName("저장 후 (userId, type, periodStart)로 조회한다")
    void save_and_findByKey() {
        Report saved = repository.save(Report.create(
            "user-1", ReportType.DAILY, LocalDate.parse("2026-05-28"),
            new ReportContent("k", "p", "t", null), "daily.v2"));

        Optional<Report> found = repository.findByUserIdAndTypeAndPeriodStart(
            "user-1", ReportType.DAILY, LocalDate.parse("2026-05-28"));

        assertThat(found).isPresent();
        assertThat(found.get().getId()).isEqualTo(saved.getId());
        assertThat(found.get().getContent().keep()).isEqualTo("k");
        assertThat(found.get().getPromptVersion()).isEqualTo("daily.v2");
    }

    @Test
    @DisplayName("키 조합이 다르면 별개 row로 저장된다")
    void differentKey_separateRows() {
        repository.save(Report.create("user-1", ReportType.DAILY, LocalDate.parse("2026-05-28"),
            new ReportContent("k", "p", "t", null), "daily.v2"));
        repository.save(Report.create("user-1", ReportType.WEEKLY, LocalDate.parse("2026-05-25"),
            new ReportContent("k", "p", "t", null), "weekly.v2"));

        assertThat(repository.count()).isEqualTo(2);
    }
}
