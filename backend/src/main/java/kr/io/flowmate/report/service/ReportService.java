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
    private final ReportGenerationLock generationLock;
    private final ReportRateLimiter rateLimiter;

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

        // 같은 리포트를 이미 만드는 중이면 409. lock을 먼저 잡아야 중복 요청이 사용자 한도를 쓰지 않는다
        ReportGenerationLock.Handle lock = generationLock.acquire(userId, type, periodStart);
        // lock 획득에서 Redis 장애가 났으면 이 요청의 나머지 Redis 호출은 건너뛴다.
        // 명령마다 timeout(2s)을 기다리면 Nginx 60s 안의 응답 예산을 넘길 수 있다
        boolean redisAvailable = !lock.bypassed();
        try {
            if (redisAvailable) {
                rateLimiter.acquire(userId, type, periodStart);
            }

            // Gemini 호출 — 트랜잭션 컨텍스트 없음
            AiReportGenerator.Result result = aiReportGenerator.generate(type, todos, weeklyReviews);

            // 짧은 쓰기 트랜잭션 (별도 빈이라 AOP 적용됨)
            ReportResponse response = reportPersistence.upsertAndFetch(userId, type, periodStart, result);
            if (redisAvailable) {
                rateLimiter.startCooldown(userId, type, periodStart);
            }
            return response;
        } finally {
            generationLock.release(lock);
        }
    }

    @Transactional(readOnly = true)
    public Optional<ReportResponse> findOne(String userId, ReportType type, LocalDate periodStart) {
        return reportRepository.findByUserIdAndTypeAndPeriodStart(userId, type, periodStart)
            .map(ReportResponse::from);
    }
}
