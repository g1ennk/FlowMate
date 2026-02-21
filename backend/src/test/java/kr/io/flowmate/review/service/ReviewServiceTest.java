package kr.io.flowmate.review.service;

import kr.io.flowmate.review.domain.Review;
import kr.io.flowmate.review.domain.ReviewType;
import kr.io.flowmate.review.dto.request.ReviewUpsertRequest;
import kr.io.flowmate.review.dto.response.ReviewResponse;
import kr.io.flowmate.review.exception.ReviewNotFoundException;
import kr.io.flowmate.review.repository.ReviewRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@DisplayName("ReviewServiceTest")
class ReviewServiceTest {

    @Mock
    private ReviewRepository reviewRepository;

    @InjectMocks
    private ReviewService reviewService;

    @Test
    @DisplayName("getReview: 존재하는 회고 조회")
    void getReview_존재하는회고_조회성공() {
        String userId = "c6d4ed5b-9d1e-4ecd-ac4f-9c1490f6fd01";
        LocalDate periodStart = LocalDate.of(2026, 2, 13);
        Review review = Review.create(userId, ReviewType.DAILY, periodStart, periodStart, "좋았던 점");

        when(reviewRepository.findByUserIdAndTypeAndPeriodStart(userId, ReviewType.DAILY, periodStart))
                .thenReturn(Optional.of(review));

        ReviewResponse result = reviewService.getReview(userId, ReviewType.DAILY, periodStart);

        assertThat(result).isNotNull();
        assertThat(result.getType()).isEqualTo("daily");
        assertThat(result.getContent()).isEqualTo("좋았던 점");
    }

    @Test
    @DisplayName("getReview: 회고가 없으면 null 반환")
    void getReview_없는회고_null반환() {
        String userId = "c6d4ed5b-9d1e-4ecd-ac4f-9c1490f6fd01";
        LocalDate periodStart = LocalDate.of(2026, 2, 13);

        when(reviewRepository.findByUserIdAndTypeAndPeriodStart(userId, ReviewType.DAILY, periodStart))
                .thenReturn(Optional.empty());

        ReviewResponse result = reviewService.getReview(userId, ReviewType.DAILY, periodStart);

        assertThat(result).isNull();
    }

    @Test
    @DisplayName("getReviews: 기간 범위 조회")
    void getReviews_기간범위조회() {
        String userId = "c6d4ed5b-9d1e-4ecd-ac4f-9c1490f6fd01";
        LocalDate from = LocalDate.of(2026, 2, 1);
        LocalDate to = LocalDate.of(2026, 2, 28);
        List<Review> reviews = List.of(
                Review.create(userId, ReviewType.DAILY, LocalDate.of(2026, 2, 1), LocalDate.of(2026, 2, 1), "1일"),
                Review.create(userId, ReviewType.DAILY, LocalDate.of(2026, 2, 2), LocalDate.of(2026, 2, 2), "2일")
        );

        when(reviewRepository.findAllByUserIdAndTypeAndPeriodStartBetweenOrderByPeriodStartAsc(
                userId,
                ReviewType.DAILY,
                from,
                to
        )).thenReturn(reviews);

        List<ReviewResponse> result = reviewService.getReviews(userId, ReviewType.DAILY, from, to);

        assertThat(result).hasSize(2);
        assertThat(result.get(0).getContent()).isEqualTo("1일");
        assertThat(result.get(1).getContent()).isEqualTo("2일");
    }

    @Test
    @DisplayName("upsertReview: 신규 생성")
    void upsertReview_신규생성() {
        String userId = "c6d4ed5b-9d1e-4ecd-ac4f-9c1490f6fd01";
        LocalDate periodStart = LocalDate.of(2026, 2, 13);
        ReviewUpsertRequest request = request("daily", periodStart, periodStart, "첫 회고");

        when(reviewRepository.findByUserIdAndTypeAndPeriodStart(userId, ReviewType.DAILY, periodStart))
                .thenReturn(Optional.empty());
        when(reviewRepository.save(any(Review.class))).thenAnswer(invocation -> invocation.getArgument(0));

        ReviewResponse result = reviewService.upsertReview(userId, request);

        assertThat(result.getType()).isEqualTo("daily");
        assertThat(result.getContent()).isEqualTo("첫 회고");
        verify(reviewRepository).save(any(Review.class));
    }

    @Test
    @DisplayName("upsertReview: 기존 회고 업데이트")
    void upsertReview_기존업데이트() {
        String userId = "c6d4ed5b-9d1e-4ecd-ac4f-9c1490f6fd01";
        LocalDate periodStart = LocalDate.of(2026, 2, 13);
        Review existing = Review.create(userId, ReviewType.DAILY, periodStart, periodStart, "원래 내용");
        ReviewUpsertRequest request = request("daily", periodStart, periodStart, "수정된 내용");

        when(reviewRepository.findByUserIdAndTypeAndPeriodStart(userId, ReviewType.DAILY, periodStart))
                .thenReturn(Optional.of(existing));

        ReviewResponse result = reviewService.upsertReview(userId, request);

        assertThat(result.getContent()).isEqualTo("수정된 내용");
        verify(reviewRepository, never()).save(any());
    }

    @Test
    @DisplayName("upsertReview: unique 충돌 발생 시 재조회 후 업데이트")
    void upsertReview_unique충돌_재조회업데이트() {
        String userId = "c6d4ed5b-9d1e-4ecd-ac4f-9c1490f6fd01";
        LocalDate periodStart = LocalDate.of(2026, 2, 13);
        ReviewUpsertRequest request = request("daily", periodStart, periodStart, "동시성 내용");
        Review collided = Review.create(userId, ReviewType.DAILY, periodStart, periodStart, "기존");

        when(reviewRepository.findByUserIdAndTypeAndPeriodStart(userId, ReviewType.DAILY, periodStart))
                .thenReturn(Optional.empty())
                .thenReturn(Optional.of(collided));
        when(reviewRepository.save(any(Review.class)))
                .thenThrow(new DataIntegrityViolationException("duplicate key"));

        ReviewResponse result = reviewService.upsertReview(userId, request);

        assertThat(result.getContent()).isEqualTo("동시성 내용");
        verify(reviewRepository).save(any(Review.class));
        verify(reviewRepository, times(2))
                .findByUserIdAndTypeAndPeriodStart(userId, ReviewType.DAILY, periodStart);
    }

    @Test
    @DisplayName("deleteReview: 삭제 성공")
    void deleteReview_삭제성공() {
        String userId = "c6d4ed5b-9d1e-4ecd-ac4f-9c1490f6fd01";
        String reviewId = "review-1";
        Review review = Review.create(
                userId,
                ReviewType.DAILY,
                LocalDate.of(2026, 2, 13),
                LocalDate.of(2026, 2, 13),
                "삭제할 회고"
        );

        when(reviewRepository.findByIdAndUserId(reviewId, userId)).thenReturn(Optional.of(review));

        reviewService.deleteReview(userId, reviewId);

        verify(reviewRepository).delete(review);
    }

    @Test
    @DisplayName("deleteReview: 대상이 없으면 ReviewNotFoundException")
    void deleteReview_없는회고_예외() {
        String userId = "c6d4ed5b-9d1e-4ecd-ac4f-9c1490f6fd01";
        String reviewId = "missing-review";

        when(reviewRepository.findByIdAndUserId(reviewId, userId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> reviewService.deleteReview(userId, reviewId))
                .isInstanceOf(ReviewNotFoundException.class)
                .hasMessageContaining(reviewId);
    }

    @Test
    @DisplayName("getReview: weekly는 월요일만 허용")
    void getReview_weekly월요일검증() {
        String userId = "c6d4ed5b-9d1e-4ecd-ac4f-9c1490f6fd01";
        LocalDate tuesday = LocalDate.of(2026, 2, 10);

        assertThatThrownBy(() -> reviewService.getReview(userId, ReviewType.WEEKLY, tuesday))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Monday");
    }

    @Test
    @DisplayName("upsertReview: monthly는 1일만 허용")
    void upsertReview_monthly일일검증() {
        String userId = "c6d4ed5b-9d1e-4ecd-ac4f-9c1490f6fd01";
        ReviewUpsertRequest request = request(
                "monthly",
                LocalDate.of(2026, 2, 2),
                LocalDate.of(2026, 2, 28),
                "월간 회고"
        );

        assertThatThrownBy(() -> reviewService.upsertReview(userId, request))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("1st");
    }

    @Test
    @DisplayName("getReviews: from이 to보다 늦으면 예외")
    void getReviews_역순기간_예외() {
        String userId = "c6d4ed5b-9d1e-4ecd-ac4f-9c1490f6fd01";
        LocalDate from = LocalDate.of(2026, 2, 28);
        LocalDate to = LocalDate.of(2026, 2, 1);

        assertThatThrownBy(() -> reviewService.getReviews(userId, ReviewType.DAILY, from, to))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("periodStart");
    }

    private ReviewUpsertRequest request(String type, LocalDate periodStart, LocalDate periodEnd, String content) {
        ReviewUpsertRequest request = new ReviewUpsertRequest();
        request.setType(type);
        request.setPeriodStart(periodStart);
        request.setPeriodEnd(periodEnd);
        request.setContent(content);
        return request;
    }
}
