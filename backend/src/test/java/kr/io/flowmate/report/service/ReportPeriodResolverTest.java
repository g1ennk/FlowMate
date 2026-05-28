package kr.io.flowmate.report.service;

import kr.io.flowmate.report.domain.ReportType;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;

@DisplayName("ReportPeriodResolver")
class ReportPeriodResolverTest {

    @Test
    @DisplayName("DAILY: from == to == periodStart")
    void daily() {
        var r = ReportPeriodResolver.resolve(ReportType.DAILY, LocalDate.parse("2026-05-28"));
        assertThat(r.from()).isEqualTo(LocalDate.parse("2026-05-28"));
        assertThat(r.to()).isEqualTo(LocalDate.parse("2026-05-28"));
    }

    @Test
    @DisplayName("WEEKLY: from = periodStart, to = +6 days")
    void weekly() {
        var r = ReportPeriodResolver.resolve(ReportType.WEEKLY, LocalDate.parse("2026-05-25"));
        assertThat(r.from()).isEqualTo(LocalDate.parse("2026-05-25"));
        assertThat(r.to()).isEqualTo(LocalDate.parse("2026-05-31"));
    }

    @Test
    @DisplayName("MONTHLY: 입력일이 중순이어도 from=1일, to=마지막 날")
    void monthly_midmonth() {
        var r = ReportPeriodResolver.resolve(ReportType.MONTHLY, LocalDate.parse("2026-05-15"));
        assertThat(r.from()).isEqualTo(LocalDate.parse("2026-05-01"));
        assertThat(r.to()).isEqualTo(LocalDate.parse("2026-05-31"));
    }

    @Test
    @DisplayName("MONTHLY: 윤년 2월 (2024-02-15 → 2-01 ~ 2-29)")
    void monthly_leap_february() {
        var r = ReportPeriodResolver.resolve(ReportType.MONTHLY, LocalDate.parse("2024-02-15"));
        assertThat(r.from()).isEqualTo(LocalDate.parse("2024-02-01"));
        assertThat(r.to()).isEqualTo(LocalDate.parse("2024-02-29"));
    }
}
