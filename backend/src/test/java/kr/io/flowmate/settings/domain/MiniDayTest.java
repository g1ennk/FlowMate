package kr.io.flowmate.settings.domain;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class MiniDayTest {

    @Test
    @DisplayName("정상 생성 — 유효한 label, startMin, endMin")
    void create_validInputs_success() {
        // given
        String label = "오전";
        int startMin = 360;
        int endMin = 720;

        // when
        MiniDay miniDay = new MiniDay(label, startMin, endMin);

        // then
        assertThat(miniDay.label()).isEqualTo("오전");
        assertThat(miniDay.startMin()).isEqualTo(360);
        assertThat(miniDay.endMin()).isEqualTo(720);
    }

    @Test
    @DisplayName("label이 null이면 IAE 발생")
    void create_nullLabel_throwsIAE() {
        assertThatThrownBy(() -> new MiniDay(null, 0, 720))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Label cannot be empty");
    }

    @Test
    @DisplayName("label이 50자 초과이면 IAE 발생")
    void create_labelExceeds50Chars_throwsIAE() {
        // given
        String longLabel = "a".repeat(51);

        // then
        assertThatThrownBy(() -> new MiniDay(longLabel, 0, 720))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Label cannot exceed 50 characters");
    }

    @Test
    @DisplayName("label 앞뒤 공백이 trim 된다")
    void create_labelWithWhitespace_trimmed() {
        // when
        MiniDay miniDay = new MiniDay("  오전  ", 0, 720);

        // then
        assertThat(miniDay.label()).isEqualTo("오전");
    }

    @Test
    @DisplayName("startMin이 0 미만이면 IAE 발생")
    void create_negativeStartMin_throwsIAE() {
        assertThatThrownBy(() -> new MiniDay("오전", -1, 720))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Start minutes must be 0-1440");
    }

    @Test
    @DisplayName("endMin이 1440 초과이면 IAE 발생")
    void create_endMinExceeds1440_throwsIAE() {
        assertThatThrownBy(() -> new MiniDay("저녁", 720, 1441))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("End minutes must be 0-1440");
    }

    @Test
    @DisplayName("startMin >= endMin이면 IAE 발생")
    void create_startMinEqualsEndMin_throwsIAE() {
        assertThatThrownBy(() -> new MiniDay("오후", 720, 720))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Start time must be before end time");
    }

    @Test
    @DisplayName("endMin 1440 (24:00)은 정상")
    void create_endMin1440_success() {
        // when
        MiniDay miniDay = new MiniDay("저녁", 1080, 1440);

        // then
        assertThat(miniDay.endMin()).isEqualTo(1440);
    }

    @Test
    @DisplayName("startMin 0 (00:00)은 정상")
    void create_startMin0_success() {
        // when
        MiniDay miniDay = new MiniDay("새벽", 0, 360);

        // then
        assertThat(miniDay.startMin()).isZero();
    }
}
