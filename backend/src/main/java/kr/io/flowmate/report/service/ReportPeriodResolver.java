package kr.io.flowmate.report.service;

import kr.io.flowmate.report.domain.ReportType;

import java.time.LocalDate;
import java.time.temporal.TemporalAdjusters;

public final class ReportPeriodResolver {

    private ReportPeriodResolver() {}

    public static Range resolve(ReportType type, LocalDate periodStart) {
        return switch (type) {
            case DAILY -> new Range(periodStart, periodStart);
            case WEEKLY -> new Range(periodStart, periodStart.plusDays(6));
            case MONTHLY -> new Range(
                periodStart.withDayOfMonth(1),
                periodStart.with(TemporalAdjusters.lastDayOfMonth())
            );
        };
    }

    public record Range(LocalDate from, LocalDate to) {}
}
