package kr.io.flowmate.review.controller;

import jakarta.validation.Valid;
import kr.io.flowmate.common.annotation.CurrentUser;
import kr.io.flowmate.common.dto.ListResponse;
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

    @GetMapping("/{periodStart}")
    public ResponseEntity<ReviewResponse> getReview(
            @CurrentUser String userId,
            @RequestParam String type,
            @PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate periodStart
    ) {
        ReviewType reviewType = ReviewType.fromValue(type);
        ReviewResponse review = reviewService.getReview(userId, reviewType, periodStart);
        if (review == null) {
            return ResponseEntity.noContent().build();
        }
        return ResponseEntity.ok(review);
    }

    @GetMapping
    public ResponseEntity<ListResponse<ReviewResponse>> getReviews(
            @CurrentUser String userId,
            @RequestParam String type,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to
    ) {
        ReviewType reviewType = ReviewType.fromValue(type);
        List<ReviewResponse> reviews = reviewService.getReviews(userId, reviewType, from, to);
        return ResponseEntity.ok(new ListResponse<>(reviews));
    }

    @PutMapping
    public ResponseEntity<ReviewResponse> upsertReview(
            @CurrentUser String userId,
            @Valid @RequestBody ReviewUpsertRequest upsertRequest
    ) {
        return ResponseEntity.ok(reviewService.upsertReview(userId, upsertRequest));
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
