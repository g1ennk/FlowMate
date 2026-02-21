package kr.io.flowmate.settings.dto.response;

import kr.io.flowmate.settings.domain.UserSettings;
import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public class AutomationSettingsResponse {

    private boolean autoStartBreak;
    private boolean autoStartSession;

    public static AutomationSettingsResponse from(UserSettings settings) {
        return new AutomationSettingsResponse(
                settings.isAutoStartBreak(),
                settings.isAutoStartSession());
    }

}
