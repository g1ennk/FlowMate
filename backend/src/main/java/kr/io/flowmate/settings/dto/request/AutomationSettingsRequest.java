package kr.io.flowmate.settings.dto.request;

import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class AutomationSettingsRequest {

    @NotNull(message = "Auto-start break setting is required")
    private Boolean autoStartBreak;

    @NotNull(message = "Auto-start session setting is required")
    private Boolean autoStartSession;

}
