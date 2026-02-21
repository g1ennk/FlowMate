package kr.io.flowmate.settings.dto.response;

import kr.io.flowmate.settings.domain.MiniDay;
import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public class MiniDayResponse {

    private String label;
    private String start;
    private String end;

    // VO -> DTO 변환
    public static MiniDayResponse from(MiniDay miniDay) {
        return new MiniDayResponse(
                miniDay.label(),
                formatMinutes(miniDay.startMin()),
                formatMinutes(miniDay.endMin())
        );
    }

    private static String formatMinutes(int minutes) {
        if (minutes == 1440) {
            return "24:00";
        }
        int hours = minutes / 60;
        int mins = minutes % 60;
        return String.format("%02d:%02d", hours, mins);
    }

}
