package kr.io.flowmate.review.domain;

import jakarta.persistence.*;
import kr.io.flowmate.common.domain.BaseTimeEntity;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "reviews")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Review extends BaseTimeEntity {

    @Id
    @Column(length = 36)
    private String id;

    @Column(name = "user_id", nullable = false, length = 36)
    private String userId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ReviewType type;

    @Column(name = "period_start", nullable = false)
    private LocalDate periodStart;

    @Column(name = "period_end", nullable = false)
    private LocalDate periodEnd;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String content;

    public static Review create(
            String userId,
            ReviewType type,
            LocalDate periodStart,
            LocalDate periodEnd,
            String content
    ) {
        Review review = new Review();

        review.id = UUID.randomUUID().toString();
        review.userId = userId;
        review.type = type;
        review.periodStart = periodStart;
        review.periodEnd = periodEnd;
        review.content = content;

        return review;
    }

    public void update(LocalDate periodEnd, String content) {
        this.periodEnd = periodEnd;
        this.content = content;
    }

}
