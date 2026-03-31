package kr.io.flowmate.timer.dto.request;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class TimerStatePushRequest {

    @NotBlank
    @Pattern(
            regexp = "idle|running|paused|waiting",
            message = "status는 idle, running, paused, waiting 중 하나여야 합니다"
    )
    private String status;

    private Object state; // idle 시 null, 아니라면 non-null

    @AssertTrue(message = "idle 시 state는 null이어야 하고, non-idle 시 non-null이어야 합니다")
    public boolean isStateConsistent() {
        if (status == null) return true;
        if ("idle".equals(status)) return state == null;
        return state != null;
    }
}
