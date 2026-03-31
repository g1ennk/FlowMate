package kr.io.flowmate.review.controller;

import jakarta.validation.Valid;
import kr.io.flowmate.common.dto.ListResponse;
import kr.io.flowmate.common.web.CurrentUser;
import kr.io.flowmate.review.domain.ReviewType;
import kr.io.flowmate.review.dto.request.ReviewUpsertRequest;
import kr.io.flowmate.review.dto.response.ReviewResponse;
import kr.io.flowmate.review.service.ReviewService;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/reviews")
@RequiredArgsConstructor
public class ReviewController {

    private final ReviewService reviewService;

    @GetMapping
    public ResponseEntity<?> getReviews(
            @CurrentUser String userId,
            @RequestParam String type,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate periodStart,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to
    ) {
        ReviewType reviewType = ReviewType.fromValue(type);

        boolean hasPeriodStart = periodStart != null;
        boolean hasFrom = from != null;
        boolean hasTo = to != null;

        if (hasPeriodStart && (hasFrom || hasTo)) {
            throw new IllegalArgumentException("Use either periodStart or (from, to), not both");
        }

        if (hasPeriodStart) {
            return reviewService.getReview(userId, reviewType, periodStart)
                    .map(ResponseEntity::ok)
                    .orElse(ResponseEntity.noContent().build());
        }

        if (hasFrom && hasTo) {
            List<ReviewResponse> reviews = reviewService.getReviews(userId, reviewType, from, to);
            return ResponseEntity.ok(new ListResponse<>(reviews));
        }

        throw new IllegalArgumentException("Either periodStart or (from, to) must be provided");
    }

    @PutMapping
    public ResponseEntity<ReviewResponse> upsertReview(
            @CurrentUser String userId,
            @Valid @RequestBody ReviewUpsertRequest upsertRequest
    ) {
        ReviewResponse review = reviewService.upsertReview(userId, upsertRequest);
        return ResponseEntity.ok(review);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteReview(
            @CurrentUser String userId,
            @PathVariable String id
    ) {
        reviewService.deleteReview(userId, id);
        return ResponseEntity.noContent().build();
    }
}
