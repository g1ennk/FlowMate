package kr.io.flowmate.review.dto.response;

import com.fasterxml.jackson.annotation.JsonFormat;
import kr.io.flowmate.review.domain.Review;

import java.time.Instant;
import java.time.LocalDate;

public record ReviewResponse(
        String id,
        String type,
        LocalDate periodStart,
        LocalDate periodEnd,
        String content,
        @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss'Z'", timezone = "UTC") Instant createdAt,
        @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss'Z'", timezone = "UTC") Instant updatedAt
) {
    public static ReviewResponse from(Review review) {
        return new ReviewResponse(
                review.getId(),
                review.getType().getValue(),
                review.getPeriodStart(),
                review.getPeriodEnd(),
                review.getContent(),
                review.getCreatedAt(),
                review.getUpdatedAt()
        );
    }
}
