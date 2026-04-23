package kr.io.flowmate.settings.dto.response;

import kr.io.flowmate.settings.domain.UserSettings;

public record MiniDaysSettingsResponse(
        MiniDayResponse day1,
        MiniDayResponse day2,
        MiniDayResponse day3
) {

    public static MiniDaysSettingsResponse from(UserSettings settings) {
        return new MiniDaysSettingsResponse(
                MiniDayResponse.from(settings.getDay1()),
                MiniDayResponse.from(settings.getDay2()),
                MiniDayResponse.from(settings.getDay3())
        );
    }

}
