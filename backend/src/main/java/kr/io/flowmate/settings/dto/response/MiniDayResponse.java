package kr.io.flowmate.settings.dto.response;

import kr.io.flowmate.settings.domain.MiniDay;

public record MiniDayResponse(String label, String start, String end) {

    public static MiniDayResponse from(MiniDay miniDay) {
        return new MiniDayResponse(
                miniDay.label(),
                formatMinutes(miniDay.startMin()),
                formatMinutes(miniDay.endMin())
        );
    }

    private static String formatMinutes(int minutes) {
        return String.format("%02d:%02d", minutes / 60, minutes % 60);
    }

}
