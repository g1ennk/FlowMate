package kr.io.flowmate.review.domain;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@DisplayName("ReviewType.fromValue")
class ReviewTypeTest {

    @Test
    @DisplayName("fromValue: 대소문자 무시 + trim 후 enum 매칭")
    void fromValue_caseInsensitiveAndTrim_returnsEnum() {
        assertThat(ReviewType.fromValue("daily")).isEqualTo(ReviewType.DAILY);
        assertThat(ReviewType.fromValue("WEEKLY")).isEqualTo(ReviewType.WEEKLY);
        assertThat(ReviewType.fromValue("  Monthly  ")).isEqualTo(ReviewType.MONTHLY);
    }

    @Test
    @DisplayName("fromValue: null 또는 빈 문자열이면 IAE (type required)")
    void fromValue_nullOrBlank_throws() {
        assertThatThrownBy(() -> ReviewType.fromValue(null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("required");
        assertThatThrownBy(() -> ReviewType.fromValue("   "))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("required");
    }

    @Test
    @DisplayName("fromValue: enum 에 없는 값이면 IAE (Invalid review type)")
    void fromValue_invalid_throws() {
        assertThatThrownBy(() -> ReviewType.fromValue("yearly"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Invalid review type");
    }
}
