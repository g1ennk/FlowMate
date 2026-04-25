package kr.io.flowmate.settings.dto.response;

import kr.io.flowmate.settings.domain.UserSettings;

public record AutomationSettingsResponse(
        boolean autoStartBreak,
        boolean autoStartSession
) {

    public static AutomationSettingsResponse from(UserSettings settings) {
        return new AutomationSettingsResponse(
                settings.isAutoStartBreak(),
                settings.isAutoStartSession()
        );
    }

}
