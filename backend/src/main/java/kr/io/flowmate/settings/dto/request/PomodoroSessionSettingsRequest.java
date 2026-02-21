package kr.io.flowmate.settings.dto.request;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class PomodoroSessionSettingsRequest {

    @Min(1)
    @Max(90)
    private int flowMin;

    @Min(1)
    @Max(90)
    private int breakMin;

    @Min(1)
    @Max(90)
    private int longBreakMin;

    @Min(1)
    @Max(10)
    private int cycleEvery;

}
