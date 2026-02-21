package kr.io.flowmate.review.dto.response;

import com.fasterxml.jackson.annotation.JsonFormat;
import kr.io.flowmate.review.domain.Review;
import lombok.AllArgsConstructor;
import lombok.Getter;

import java.time.Instant;
import java.time.LocalDate;

@Getter
@AllArgsConstructor
public class ReviewResponse {

    private String id;
    private String type;
    private LocalDate periodStart;
    private LocalDate periodEnd;
    private String content;

    @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss'Z'", timezone = "UTC")
    private Instant createdAt;

    @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss'Z'", timezone = "UTC")
    private Instant updatedAt;

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
