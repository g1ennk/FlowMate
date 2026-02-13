package kr.io.flowmate.settings.dto.request;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class MiniDaysSettingsRequest {

    @NotNull(message = "Day 1 is required")
    @Valid
    private MiniDayRequest day1;

    @NotNull(message = "Day 2 is required")
    @Valid
    private MiniDayRequest day2;

    @NotNull(message = "Day 3 is required")
    @Valid
    private MiniDayRequest day3;

}
