package kr.io.flowmate.settings.dto.response;

import kr.io.flowmate.settings.domain.UserSettings;
import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public class PomodoroSessionSettingsResponse {

    private int flowMin;
    private int breakMin;
    private int longBreakMin;
    private int cycleEvery;

    public static PomodoroSessionSettingsResponse from(UserSettings settings) {
        return new PomodoroSessionSettingsResponse(
                settings.getFlowMin(),
                settings.getBreakMin(),
                settings.getLongBreakMin(),
                settings.getCycleEvery()
        );
    }

}
