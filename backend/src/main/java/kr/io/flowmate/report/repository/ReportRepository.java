package kr.io.flowmate.report.repository;

import kr.io.flowmate.report.domain.Report;
import kr.io.flowmate.report.domain.ReportType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.Optional;

@Repository
public interface ReportRepository extends JpaRepository<Report, String> {

    Optional<Report> findByUserIdAndTypeAndPeriodStart(
        String userId,
        ReportType type,
        LocalDate periodStart
    );
}
