package kr.io.flowmate.settings.domain;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@DisplayName("MiniDay")
class MiniDayTest {

    @Test
    @DisplayName("생성: label 앞뒤 공백을 trim 해서 저장한다")
    void create_trimsWhitespaceOnLabel() {
        MiniDay day = new MiniDay("  오전  ", 360, 720);

        assertThat(day.label()).isEqualTo("오전");
    }

    @Test
    @DisplayName("생성: label 이 공백뿐이면 IAE")
    void create_blankLabel_throwsIae() {
        assertThatThrownBy(() -> new MiniDay("   ", 0, 60))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Label cannot be empty");
    }

    @Test
    @DisplayName("생성: start >= end 이면 IAE (역전/동일 모두)")
    void create_startNotBeforeEnd_throwsIae() {
        assertThatThrownBy(() -> new MiniDay("오전", 720, 360))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Start time must be before end time");

        assertThatThrownBy(() -> new MiniDay("오전", 360, 360))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Start time must be before end time");
    }

    @Test
    @DisplayName("생성: 경계값 start=0, end=1440 은 정상")
    void create_boundaryValues_succeeds() {
        MiniDay day = new MiniDay("종일", 0, 1440);

        assertThat(day.startMin()).isZero();
        assertThat(day.endMin()).isEqualTo(1440);
    }
}
