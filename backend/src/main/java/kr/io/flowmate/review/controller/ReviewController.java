package kr.io.flowmate.review.controller;

import jakarta.validation.Valid;
import kr.io.flowmate.common.dto.ListResponse;
import kr.io.flowmate.common.util.CurrentUserResolver;
import kr.io.flowmate.review.domain.ReviewType;
import kr.io.flowmate.review.dto.request.ReviewUpsertRequest;
import kr.io.flowmate.review.dto.response.ReviewResponse;
import kr.io.flowmate.review.service.ReviewService;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/reviews")
@RequiredArgsConstructor
public class ReviewController {

    private final ReviewService reviewService;
    private final CurrentUserResolver currentUserResolver;

    @GetMapping
    public ResponseEntity<?> getReviews(
            @RequestParam String type,
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate periodStart,
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to
    ) {
        String userId = currentUserResolver.resolve();
        ReviewType reviewType = ReviewType.fromValue(type);

        boolean hasPeriodStart = periodStart != null;
        boolean hasFrom = from != null;
        boolean hasTo = to != null;

        if (hasPeriodStart && (hasFrom || hasTo)) {
            throw new IllegalArgumentException("Use either periodStart or (from, to), not both");
        }

        if (hasPeriodStart) {
            ReviewResponse review = reviewService.getReview(userId, reviewType, periodStart);
            if (review == null) {
                return ResponseEntity.ok()
                        .contentType(MediaType.APPLICATION_JSON)
                        .body("null");
            }
            return ResponseEntity.ok(review);
        }

        if (hasFrom && hasTo) {
            List<ReviewResponse> reviews = reviewService.getReviews(userId, reviewType, from, to);
            return ResponseEntity.ok(new ListResponse<>(reviews));
        }

        throw new IllegalArgumentException("Either periodStart or (from, to) must be provided");
    }

    @PutMapping
    public ResponseEntity<ReviewResponse> upsertReview(
            @Valid @RequestBody ReviewUpsertRequest upsertRequest
    ) {
        String userId = currentUserResolver.resolve();
        ReviewResponse review = reviewService.upsertReview(userId, upsertRequest);
        return ResponseEntity.ok(review);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteReview(
            @PathVariable String id
    ) {
        String userId = currentUserResolver.resolve();
        reviewService.deleteReview(userId, id);
        return ResponseEntity.noContent().build();
    }

}
