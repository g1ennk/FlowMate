package kr.io.flowmate.settings.dto.response;

import kr.io.flowmate.settings.domain.UserSettings;
import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public class MiniDaysSettingsResponse {

    private MiniDayResponse day1;
    private MiniDayResponse day2;
    private MiniDayResponse day3;

    // Entity -> DTO 변환
    public static MiniDaysSettingsResponse from(UserSettings settings) {
        return new MiniDaysSettingsResponse(
                MiniDayResponse.from(settings.getDay1()),
                MiniDayResponse.from(settings.getDay2()),
                MiniDayResponse.from(settings.getDay3())
        );
    }

}
