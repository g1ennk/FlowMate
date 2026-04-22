package kr.io.flowmate.review.domain;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;

@DisplayName("Review.update")
class ReviewTest {

    @Test
    @DisplayName("update: periodEnd/content 만 변경. updatedAt 은 @PreUpdate 가 flush 시점에 갱신 (mutator 책임 아님)")
    void update_setsFieldsOnly() {
        LocalDate monday = LocalDate.of(2026, 2, 16);
        Review review = Review.create(
                "user-1", ReviewType.WEEKLY, monday, monday.plusDays(6), "초안");

        review.update(monday.plusDays(6), "최종본");

        assertThat(review.getContent()).isEqualTo("최종본");
        assertThat(review.getPeriodEnd()).isEqualTo(monday.plusDays(6));
    }
}
