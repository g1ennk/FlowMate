package kr.io.flowmate.review.service;

import kr.io.flowmate.review.domain.Review;
import kr.io.flowmate.review.domain.ReviewType;
import kr.io.flowmate.review.dto.request.ReviewUpsertRequest;
import kr.io.flowmate.review.dto.response.ReviewResponse;
import kr.io.flowmate.review.exception.ReviewNotFoundException;
import kr.io.flowmate.review.repository.ReviewRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.List;

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

        Review existing = reviewRepository.findByUserIdAndTypeAndPeriodStart(userId, type, periodStart)
                .orElse(null);
        if (existing != null) {
            existing.update(periodEnd, content);
            return ReviewResponse.from(existing);
        }

        Review created = Review.create(userId, type, periodStart, periodEnd, content);
        try {
            Review saved = reviewRepository.save(created);
            return ReviewResponse.from(saved);
        } catch (DataIntegrityViolationException ex) {
            Review collided = reviewRepository.findByUserIdAndTypeAndPeriodStart(userId, type, periodStart)
                    .orElseThrow(() -> ex);
            collided.update(periodEnd, content);
            return ReviewResponse.from(collided);
        }
    }

    @Transactional
    public void deleteReview(String userId, String reviewId) {
        Review review = reviewRepository.findByIdAndUserId(reviewId, userId)
                .orElseThrow(() -> new ReviewNotFoundException(reviewId));
        reviewRepository.delete(review);
    }

    private void validatePeriodRule(ReviewType type, LocalDate periodStart) {
        if (periodStart == null) {
            throw new IllegalArgumentException("periodStart is required");
        }
        if (type == ReviewType.WEEKLY && periodStart.getDayOfWeek() != DayOfWeek.MONDAY) {
            throw new IllegalArgumentException("Weekly review must start on Monday");
        }
        if (type == ReviewType.MONTHLY && periodStart.getDayOfMonth() != 1) {
            throw new IllegalArgumentException("Monthly review must start on the 1st");
        }
    }

    private void validatePeriodRange(LocalDate from, LocalDate to) {
        if (from == null || to == null) {
            throw new IllegalArgumentException("period range is required");
        }
        if (from.isAfter(to)) {
            throw new IllegalArgumentException("periodStart must be before or equal to periodEnd");
        }
    }

}
