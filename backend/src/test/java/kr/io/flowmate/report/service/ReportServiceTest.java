package kr.io.flowmate.report.service;

import kr.io.flowmate.report.domain.ReportContent;
import kr.io.flowmate.report.domain.ReportType;
import kr.io.flowmate.report.dto.response.ReportResponse;
import kr.io.flowmate.report.prompt.TodoFixtures;
import kr.io.flowmate.report.repository.ReportRepository;
import kr.io.flowmate.review.repository.ReviewRepository;
import kr.io.flowmate.todo.domain.Todo;
import kr.io.flowmate.todo.repository.TodoRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@DisplayName("ReportService")
class ReportServiceTest {

    private static final String USER = "user-1";
    private static final LocalDate TODAY = LocalDate.parse("2026-05-28");

    @Mock private ReportRepository reportRepo;
    @Mock private TodoRepository todoRepo;
    @Mock private ReviewRepository reviewRepo;
    @Mock private AiReportGenerator generator;
    @Mock private ReportPersistence persistence;
    @InjectMocks private ReportService service;

    @Test
    @DisplayName("todos 0개면 IllegalArgumentException — Gemini도 persistence도 호출 안 함")
    void generate_emptyData() {
        when(todoRepo.findAllByUserIdAndDateBetweenOrderByDateAscMiniDayAscDayOrderAscCreatedAtAsc(USER, TODAY, TODAY))
            .thenReturn(List.of());

        assertThatThrownBy(() -> service.generate(USER, ReportType.DAILY, TODAY))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessage("생성할 데이터가 없습니다");

        verify(generator, never()).generate(any(), any(), any());
        verify(persistence, never()).upsertAndFetch(any(), any(), any(), any());
    }

    @Test
    @DisplayName("DAILY: weekly reviews 조회 안 함 + persistence 호출")
    void generate_daily_no_reviews() {
        Todo todo = TodoFixtures.completed("x", 60, 1);
        ReportResponse expected = sampleResponse();

        when(todoRepo.findAllByUserIdAndDateBetweenOrderByDateAscMiniDayAscDayOrderAscCreatedAtAsc(USER, TODAY, TODAY))
            .thenReturn(List.of(todo));
        when(generator.generate(eq(ReportType.DAILY), eq(List.of(todo)), eq(List.of())))
            .thenReturn(new AiReportGenerator.Result(
                new ReportContent("k", "p", "t", null), "daily.v2"));
        when(persistence.upsertAndFetch(eq(USER), eq(ReportType.DAILY), eq(TODAY), any()))
            .thenReturn(expected);

        ReportResponse resp = service.generate(USER, ReportType.DAILY, TODAY);

        assertThat(resp).isSameAs(expected);
        verify(reviewRepo, never())
            .findAllByUserIdAndTypeAndPeriodStartBetweenOrderByPeriodStartAsc(any(), any(), any(), any());
    }

    @Test
    @DisplayName("MONTHLY: weekly reviews 조회 + persistence 호출")
    void generate_monthly_fetches_reviews() {
        Todo todo = TodoFixtures.completed("x", 60, 1);
        when(todoRepo.findAllByUserIdAndDateBetweenOrderByDateAscMiniDayAscDayOrderAscCreatedAtAsc(any(), any(), any()))
            .thenReturn(List.of(todo));
        when(reviewRepo.findAllByUserIdAndTypeAndPeriodStartBetweenOrderByPeriodStartAsc(any(), any(), any(), any()))
            .thenReturn(List.of());
        when(generator.generate(any(), any(), any()))
            .thenReturn(new AiReportGenerator.Result(new ReportContent("k","p","t",null), "monthly.v2"));
        when(persistence.upsertAndFetch(any(), any(), any(), any())).thenReturn(sampleResponse());

        service.generate(USER, ReportType.MONTHLY, LocalDate.parse("2026-05-01"));

        verify(reviewRepo)
            .findAllByUserIdAndTypeAndPeriodStartBetweenOrderByPeriodStartAsc(any(), any(), any(), any());
        verify(persistence).upsertAndFetch(any(), any(), any(), any());
    }

    @Test
    @DisplayName("findOne: 없으면 Optional.empty")
    void findOne_missing() {
        when(reportRepo.findByUserIdAndTypeAndPeriodStart(USER, ReportType.DAILY, TODAY))
            .thenReturn(Optional.empty());

        assertThat(service.findOne(USER, ReportType.DAILY, TODAY)).isEmpty();
    }

    private static ReportResponse sampleResponse() {
        return new ReportResponse("r1", "DAILY", TODAY, "k", "p", "t", null, "daily.v2", Instant.now());
    }
}
