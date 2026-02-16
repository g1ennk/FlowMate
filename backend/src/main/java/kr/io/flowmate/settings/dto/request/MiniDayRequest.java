package kr.io.flowmate.settings.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import kr.io.flowmate.settings.domain.MiniDay;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class MiniDayRequest {

    @NotBlank
    @Size(max = 50)
    private String label;

    @NotBlank
    @Pattern(
            regexp = "^([0-1][0-9]|2[0-3]):[0-5][0-9]$",
            message = "시간 형식은 HH:mm이어야 합니다"
    )
    private String start;

    @NotBlank
    @Pattern(
            regexp = "^([0-1][0-9]|2[0-3]):[0-5][0-9]$|^24:00$",
            message = "시간 형식은 HH:mm이어야 합니다"
    )
    private String end;

    // DTO -> VO 변환
    public MiniDay toMiniDay() {
        return new MiniDay(label.trim(), getStartMinutes(), getEndMinutes());
    }

    public int getStartMinutes() {
        return parseTime(start);
    }

    public int getEndMinutes() {
        return parseTime(end);
    }

    private int parseTime(String time) {
        String[] parts = time.split(":");
        int hours = Integer.parseInt(parts[0]);
        int minutes = Integer.parseInt(parts[1]);
        return hours * 60 + minutes;
    }

}
