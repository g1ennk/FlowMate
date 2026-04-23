package kr.io.flowmate.settings.dto.response;

import kr.io.flowmate.settings.domain.UserSettings;

public record SettingsResponse(
        PomodoroSessionSettingsResponse pomodoroSession,
        AutomationSettingsResponse automation,
        MiniDaysSettingsResponse miniDays
) {

    public static SettingsResponse from(UserSettings settings) {
        return new SettingsResponse(
                PomodoroSessionSettingsResponse.from(settings),
                AutomationSettingsResponse.from(settings),
                MiniDaysSettingsResponse.from(settings)
        );
    }

}
