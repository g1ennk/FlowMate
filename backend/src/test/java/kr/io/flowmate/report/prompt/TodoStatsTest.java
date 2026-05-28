package kr.io.flowmate.report.prompt;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

@DisplayName("TodoStats / focusTime")
class TodoStatsTest {

    @Test
    @DisplayName("focusTime: 4500초 = 1시간 15분")
    void focusTime_4500s() {
        assertThat(PromptTexts.focusTime(4500)).isEqualTo("1시간 15분");
    }

    @Test
    @DisplayName("focusTime: 1800초 = 30분 (시간 0이면 시간 안 붙임)")
    void focusTime_1800s() {
        assertThat(PromptTexts.focusTime(1800)).isEqualTo("30분");
    }

    @Test
    @DisplayName("focusTime: 0초 = 0분")
    void focusTime_zero() {
        assertThat(PromptTexts.focusTime(0)).isEqualTo("0분");
    }

    @Test
    @DisplayName("focusTime: 반올림 (45초 → 1분, 29초 → 0분)")
    void focusTime_rounds() {
        assertThat(PromptTexts.focusTime(45)).isEqualTo("1분");
        assertThat(PromptTexts.focusTime(29)).isEqualTo("0분");
    }
}
