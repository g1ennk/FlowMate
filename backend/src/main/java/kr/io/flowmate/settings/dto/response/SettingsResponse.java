package kr.io.flowmate.settings.dto.response;

import kr.io.flowmate.settings.domain.UserSettings;
import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public class SettingsResponse {

    private PomodoroSessionSettingsResponse pomodoroSession;
    private AutomationSettingsResponse automation;
    private MiniDaysSettingsResponse miniDays;

    public static SettingsResponse from(UserSettings settings) {
        return new SettingsResponse(
                PomodoroSessionSettingsResponse.from(settings),
                AutomationSettingsResponse.from(settings),
                MiniDaysSettingsResponse.from(settings)
        );
    }

}
