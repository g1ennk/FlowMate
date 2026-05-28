package kr.io.flowmate.report.service;

import kr.io.flowmate.report.domain.Report;
import kr.io.flowmate.report.domain.ReportType;
import kr.io.flowmate.report.dto.response.ReportResponse;
import kr.io.flowmate.report.repository.ReportRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;

@Component
@RequiredArgsConstructor
public class ReportPersistence {

    private final ReportRepository reportRepository;

    @Transactional
    public ReportResponse upsertAndFetch(
        String userId, ReportType type, LocalDate periodStart, AiReportGenerator.Result result
    ) {
        Report saved = reportRepository.findByUserIdAndTypeAndPeriodStart(userId, type, periodStart)
            .map(existing -> {
                existing.updateContent(result.content(), result.promptVersion());
                return existing;
            })
            .orElseGet(() -> reportRepository.save(
                Report.create(userId, type, periodStart, result.content(), result.promptVersion())));
        return ReportResponse.from(saved);
    }
}
