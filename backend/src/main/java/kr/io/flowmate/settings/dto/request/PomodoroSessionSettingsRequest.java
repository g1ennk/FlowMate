package kr.io.flowmate.settings.dto.request;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import lombok.Getter;
import lombok.Setter;

import static kr.io.flowmate.settings.domain.PomodoroConfig.MAX_CYCLE;
import static kr.io.flowmate.settings.domain.PomodoroConfig.MAX_MINUTES;
import static kr.io.flowmate.settings.domain.PomodoroConfig.MIN_CYCLE;
import static kr.io.flowmate.settings.domain.PomodoroConfig.MIN_MINUTES;

@Getter
@Setter
public class PomodoroSessionSettingsRequest {

    @Min(MIN_MINUTES)
    @Max(MAX_MINUTES)
    private int flowMin;

    @Min(MIN_MINUTES)
    @Max(MAX_MINUTES)
    private int breakMin;

    @Min(MIN_MINUTES)
    @Max(MAX_MINUTES)
    private int longBreakMin;

    @Min(MIN_CYCLE)
    @Max(MAX_CYCLE)
    private int cycleEvery;

}
