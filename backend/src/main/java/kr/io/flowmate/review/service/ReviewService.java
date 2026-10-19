package kr.io.flowmate.review.service;

import kr.io.flowmate.review.domain.Review;
import kr.io.flowmate.review.domain.ReviewType;
import kr.io.flowmate.review.dto.request.ReviewUpsertRequest;
import kr.io.flowmate.review.dto.response.ReviewResponse;
import kr.io.flowmate.review.exception.ReviewNotFoundException;
import kr.io.flowmate.review.repository.ReviewRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class ReviewService {

    private final ReviewRepository reviewRepository;

    public ReviewResponse getReview(String userId, ReviewType type, LocalDate periodStart) {
        validatePeriodRule(type, periodStart);
        return reviewRepository.findByUserIdAndTypeAndPeriodStart(userId, type, periodStart)
                .map(ReviewResponse::from)
                .orElse(null);
    }

    public List<ReviewResponse> getReviews(String userId, ReviewType type, LocalDate from, LocalDate to) {
        validatePeriodRange(from, to);
        return reviewRepository.findAllByUserIdAndTypeAndPeriodStartBetweenOrderByPeriodStartAsc(userId, type, from, to)
                .stream()
                .map(ReviewResponse::from)
                .toList();
    }

    @Transactional
    public ReviewResponse upsertReview(String userId, ReviewUpsertRequest request) {
        ReviewType type = ReviewType.fromValue(request.getType());
        LocalDate periodStart = request.getPeriodStart();
        LocalDate periodEnd = request.getPeriodEnd();

        validatePeriodRule(type, periodStart);
        validatePeriodRange(periodStart, periodEnd);

        String content = request.getContent().trim();
        // reviews.updated_at은 초 단위 컬럼이라 저장값과 같도록 초로 자른다
        Instant now = Instant.now().truncatedTo(ChronoUnit.SECONDS);

        // 조회 후 INSERT 대신 생성과 갱신을 한 문장으로 처리한다. 같은 회고를 동시에 처음 저장해도 충돌하지 않는다
        reviewRepository.upsert(UUID.randomUUID().toString(), userId, type.name(),
                periodStart, periodEnd, content, now);

        // upsert가 이 트랜잭션의 첫 쿼리이고 행 락을 커밋까지 쥐므로, 다시 읽은 행은 방금 확정된 내용이다
        return reviewRepository.findByUserIdAndTypeAndPeriodStart(userId, type, periodStart)
                .map(ReviewResponse::from)
                .orElseThrow(() -> new IllegalStateException("저장한 회고를 찾을 수 없습니다."));
    }

    @Transactional
    public void deleteReview(String userId, String reviewId) {
        Review review = reviewRepository.findByIdAndUserId(reviewId, userId)
                .orElseThrow(() -> new ReviewNotFoundException(reviewId));
        reviewRepository.delete(review);
    }

    private void validatePeriodRule(ReviewType type, LocalDate periodStart) {
        if (type == ReviewType.WEEKLY && periodStart.getDayOfWeek() != DayOfWeek.MONDAY) {
            throw new IllegalArgumentException("Weekly review must start on Monday");
        }
        if (type == ReviewType.MONTHLY && periodStart.getDayOfMonth() != 1) {
            throw new IllegalArgumentException("Monthly review must start on the 1st");
        }
    }

    private void validatePeriodRange(LocalDate from, LocalDate to) {
        if (from.isAfter(to)) {
            throw new IllegalArgumentException("periodStart must be before or equal to periodEnd");
        }
    }

}
