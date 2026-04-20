package kr.io.flowmate.todo.domain;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@DisplayName("TimerMode")
class TimerModeTest {

    @Test
    @DisplayName("fromValue: 대소문자 구분 없이 enum을 반환한다")
    void fromValue_caseInsensitive_returnsEnum() {
        assertThat(TimerMode.fromValue("pomodoro")).isEqualTo(TimerMode.POMODORO);
        assertThat(TimerMode.fromValue("POMODORO")).isEqualTo(TimerMode.POMODORO);
        assertThat(TimerMode.fromValue("Stopwatch")).isEqualTo(TimerMode.STOPWATCH);
    }

    @Test
    @DisplayName("fromValue: 정의되지 않은 값이면 IAE")
    void fromValue_unknown_throwsIAE() {
        assertThatThrownBy(() -> TimerMode.fromValue("flow-timer"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Invalid timerMode");
    }
}
