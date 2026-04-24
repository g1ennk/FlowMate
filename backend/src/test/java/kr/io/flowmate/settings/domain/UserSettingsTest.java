package kr.io.flowmate.settings.domain;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

@DisplayName("UserSettings")
class UserSettingsTest {

    private static final String USER_ID = "c6d4ed5b-9d1e-4ecd-ac4f-9c1490f6fd01";

    @Test
    @DisplayName("updatePomodoro: 4 필드를 전체 교체한다")
    void updatePomodoro_replacesAllFields() {
        UserSettings settings = UserSettings.createWithDefaults(USER_ID);

        settings.updatePomodoro(new PomodoroConfig(40, 8, 20, 5));

        assertThat(settings.getFlowMin()).isEqualTo(40);
        assertThat(settings.getBreakMin()).isEqualTo(8);
        assertThat(settings.getLongBreakMin()).isEqualTo(20);
        assertThat(settings.getCycleEvery()).isEqualTo(5);
    }

    @Test
    @DisplayName("updateMiniDays: MiniDay VO 3개를 평면 9 필드로 분해 저장한다")
    void updateMiniDays_splitsThreeVosIntoNineFlatFields() {
        UserSettings settings = UserSettings.createWithDefaults(USER_ID);

        settings.updateMiniDays(
                new MiniDay("새벽", 0, 360),
                new MiniDay("낮", 360, 1080),
                new MiniDay("밤", 1080, 1440)
        );

        assertThat(settings.getDay1Label()).isEqualTo("새벽");
        assertThat(settings.getDay1StartMin()).isZero();
        assertThat(settings.getDay1EndMin()).isEqualTo(360);
        assertThat(settings.getDay3Label()).isEqualTo("밤");
        assertThat(settings.getDay3EndMin()).isEqualTo(1440);
    }
}
