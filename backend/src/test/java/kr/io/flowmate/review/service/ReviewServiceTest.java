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

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@DisplayName("ReviewService")
class ReviewServiceTest {

    private static final String USER_ID = "c6d4ed5b-9d1e-4ecd-ac4f-9c1490f6fd01";
    private static final LocalDate MONDAY = LocalDate.of(2026, 2, 16);

    @Mock
    private ReviewRepository reviewRepository;

    @InjectMocks
    private ReviewService reviewService;

    @Test
    @DisplayName("getReview: 존재하면 ReviewResponse 로 매핑하여 반환")
    void getReview_existing_returnsResponse() {
        Review review = Review.create(USER_ID, ReviewType.DAILY, MONDAY, MONDAY, "오늘 회고");
        when(reviewRepository.findByUserIdAndTypeAndPeriodStart(USER_ID, ReviewType.DAILY, MONDAY))
                .thenReturn(Optional.of(review));

        ReviewResponse result = reviewService.getReview(USER_ID, ReviewType.DAILY, MONDAY);

        assertThat(result).isNotNull();
        assertThat(result.type()).isEqualTo("daily");
        assertThat(result.content()).isEqualTo("오늘 회고");
    }

    @Test
    @DisplayName("getReview: 미존재 시 null 반환 (컨트롤러가 200+'null' 본문 분기에 사용)")
    void getReview_missing_returnsNull() {
        when(reviewRepository.findByUserIdAndTypeAndPeriodStart(USER_ID, ReviewType.DAILY, MONDAY))
                .thenReturn(Optional.empty());

        ReviewResponse result = reviewService.getReview(USER_ID, ReviewType.DAILY, MONDAY);

        assertThat(result).isNull();
    }

    @Test
    @DisplayName("getReviews: 범위 조회 결과를 ReviewResponse 리스트로 매핑")
    void getReviews_range_mapsToList() {
        LocalDate from = LocalDate.of(2026, 2, 1);
        LocalDate to = LocalDate.of(2026, 2, 28);
        List<Review> rows = List.of(
                Review.create(USER_ID, ReviewType.DAILY, LocalDate.of(2026, 2, 1), LocalDate.of(2026, 2, 1), "1일"),
                Review.create(USER_ID, ReviewType.DAILY, LocalDate.of(2026, 2, 2), LocalDate.of(2026, 2, 2), "2일")
        );
        when(reviewRepository.findAllByUserIdAndTypeAndPeriodStartBetweenOrderByPeriodStartAsc(
                USER_ID, ReviewType.DAILY, from, to)).thenReturn(rows);

        List<ReviewResponse> result = reviewService.getReviews(USER_ID, ReviewType.DAILY, from, to);

        assertThat(result).extracting(ReviewResponse::content).containsExactly("1일", "2일");
    }

    @Test
    @DisplayName("upsertReview: 내용을 trim 해 upsert 한 뒤 저장된 행을 다시 읽어 응답")
    void upsertReview_upsertsTrimmedContentThenReadsSavedRow() {
        Review saved = Review.create(USER_ID, ReviewType.DAILY, MONDAY, MONDAY, "첫 회고");
        when(reviewRepository.findByUserIdAndTypeAndPeriodStart(USER_ID, ReviewType.DAILY, MONDAY))
                .thenReturn(Optional.of(saved));

        ReviewResponse result = reviewService.upsertReview(USER_ID, request("daily", MONDAY, MONDAY, "  첫 회고  "));

        assertThat(result.id()).isEqualTo(saved.getId());
        assertThat(result.content()).isEqualTo("첫 회고");
        verify(reviewRepository).upsert(anyString(), eq(USER_ID), eq("DAILY"), eq(MONDAY), eq(MONDAY),
                eq("첫 회고"), any(Instant.class));
        verify(reviewRepository, never()).save(any());
    }

    @Test
    @DisplayName("upsertReview: WEEKLY 인데 periodStart 가 월요일이 아니면 IAE (저장하지 않음)")
    void upsertReview_weeklyNonMonday_throws() {
        LocalDate tuesday = LocalDate.of(2026, 2, 17);
        ReviewUpsertRequest request = request("weekly", tuesday, tuesday.plusDays(6), "주간");

        assertThatThrownBy(() -> reviewService.upsertReview(USER_ID, request))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Monday");
        verify(reviewRepository, never()).upsert(any(), any(), any(), any(), any(), any(), any());
    }

    @Test
    @DisplayName("deleteReview: 존재하지 않으면 ReviewNotFoundException (404 매핑)")
    void deleteReview_missing_throwsNotFound() {
        when(reviewRepository.findByIdAndUserId("missing", USER_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> reviewService.deleteReview(USER_ID, "missing"))
                .isInstanceOf(ReviewNotFoundException.class)
                .hasMessageContaining("missing");
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
