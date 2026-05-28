package kr.io.flowmate.report.service;

import kr.io.flowmate.report.domain.ReportType;
import kr.io.flowmate.report.dto.response.ReportResponse;
import kr.io.flowmate.report.repository.ReportRepository;
import kr.io.flowmate.review.domain.Review;
import kr.io.flowmate.review.domain.ReviewType;
import kr.io.flowmate.review.repository.ReviewRepository;
import kr.io.flowmate.todo.domain.Todo;
import kr.io.flowmate.todo.repository.TodoRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class ReportService {

    private final ReportRepository reportRepository;
    private final TodoRepository todoRepository;
    private final ReviewRepository reviewRepository;
    private final AiReportGenerator aiReportGenerator;
    private final ReportPersistence reportPersistence;

    /** 트랜잭션 어노테이션 없음 — Gemini 호출 동안 DB connection 미점유 보장 */
    public ReportResponse generate(String userId, ReportType type, LocalDate periodStart) {
        ReportPeriodResolver.Range range = ReportPeriodResolver.resolve(type, periodStart);

        List<Todo> todos = todoRepository
            .findAllByUserIdAndDateBetweenOrderByDateAscMiniDayAscDayOrderAscCreatedAtAsc(
                userId, range.from(), range.to());
        if (todos.isEmpty()) {
            throw new IllegalArgumentException("생성할 데이터가 없습니다");
        }
        List<Review> weeklyReviews = type == ReportType.MONTHLY
            ? reviewRepository.findAllByUserIdAndTypeAndPeriodStartBetweenOrderByPeriodStartAsc(
                userId, ReviewType.WEEKLY, range.from(), range.to())
            : List.of();

        // Gemini 호출 — 트랜잭션 컨텍스트 없음
        AiReportGenerator.Result result = aiReportGenerator.generate(type, todos, weeklyReviews);

        // 짧은 쓰기 트랜잭션 (별도 빈이라 AOP 적용됨)
        return reportPersistence.upsertAndFetch(userId, type, periodStart, result);
    }

    @Transactional(readOnly = true)
    public Optional<ReportResponse> findOne(String userId, ReportType type, LocalDate periodStart) {
        return reportRepository.findByUserIdAndTypeAndPeriodStart(userId, type, periodStart)
            .map(ReportResponse::from);
    }
}
