package kr.io.flowmate.settings.dto.response;

import kr.io.flowmate.settings.domain.UserSettings;

public record PomodoroSessionSettingsResponse(
        int flowMin,
        int breakMin,
        int longBreakMin,
        int cycleEvery
) {

    public static PomodoroSessionSettingsResponse from(UserSettings settings) {
        return new PomodoroSessionSettingsResponse(
                settings.getFlowMin(),
                settings.getBreakMin(),
                settings.getLongBreakMin(),
                settings.getCycleEvery()
        );
    }

}
