package kr.io.flowmate.settings.domain;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PomodoroConfigTest {

    @Test
    @DisplayName("정상 생성 — 경계 최소값 (1, 1, 1, 1)")
    void create_minimumBoundary_success() {
        // when
        PomodoroConfig config = new PomodoroConfig(1, 1, 1, 1);

        // then
        assertThat(config.flowMin()).isEqualTo(1);
        assertThat(config.breakMin()).isEqualTo(1);
        assertThat(config.longBreakMin()).isEqualTo(1);
        assertThat(config.cycleEvery()).isEqualTo(1);
    }

    @Test
    @DisplayName("정상 생성 — 경계 최대값 (90, 90, 90, 10)")
    void create_maximumBoundary_success() {
        // when
        PomodoroConfig config = new PomodoroConfig(90, 90, 90, 10);

        // then
        assertThat(config.flowMin()).isEqualTo(90);
        assertThat(config.breakMin()).isEqualTo(90);
        assertThat(config.longBreakMin()).isEqualTo(90);
        assertThat(config.cycleEvery()).isEqualTo(10);
    }

    @Test
    @DisplayName("flowMin이 0이면 IAE 발생")
    void create_flowMinZero_throwsIAE() {
        assertThatThrownBy(() -> new PomodoroConfig(0, 5, 15, 4))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Flow time must be between 1 and 90");
    }

    @Test
    @DisplayName("flowMin이 91이면 IAE 발생")
    void create_flowMin91_throwsIAE() {
        assertThatThrownBy(() -> new PomodoroConfig(91, 5, 15, 4))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Flow time must be between 1 and 90");
    }

    @Test
    @DisplayName("breakMin이 0이면 IAE 발생")
    void create_breakMinZero_throwsIAE() {
        assertThatThrownBy(() -> new PomodoroConfig(25, 0, 15, 4))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Break time must be between 1 and 90");
    }

    @Test
    @DisplayName("longBreakMin이 91이면 IAE 발생")
    void create_longBreakMin91_throwsIAE() {
        assertThatThrownBy(() -> new PomodoroConfig(25, 5, 91, 4))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Long break time must be between 1 and 90");
    }

    @Test
    @DisplayName("cycleEvery가 0이면 IAE 발생")
    void create_cycleEveryZero_throwsIAE() {
        assertThatThrownBy(() -> new PomodoroConfig(25, 5, 15, 0))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Cycle must be between 1 and 10");
    }

    @Test
    @DisplayName("cycleEvery가 11이면 IAE 발생")
    void create_cycleEvery11_throwsIAE() {
        assertThatThrownBy(() -> new PomodoroConfig(25, 5, 15, 11))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Cycle must be between 1 and 10");
    }
}
