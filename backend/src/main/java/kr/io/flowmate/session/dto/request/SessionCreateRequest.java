package kr.io.flowmate.session.dto.request;

import jakarta.validation.constraints.*;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class SessionCreateRequest {

    private static final String UUID_RE =
            "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$";


    @NotNull(message = "sessionFocusSeconds is required")
    @Min(value = 1, message = "sessionFocusSeconds must be >= 1")
    @Max(value = 43_200, message = "sessionFocusSeconds must be <= 43200 (12 hours)")
    private Integer sessionFocusSeconds;

    @Min(value = 0, message = "breakSeconds must be >= 0")
    @Max(value = 43_200, message = "breakSeconds must be <= 43200 (12 hours)")
    private Integer breakSeconds = 0;

    @NotBlank(message = "clientSessionId is required")
    @Pattern(regexp = UUID_RE, message = "clientSessionId must be a valid UUID")
    private String clientSessionId;

    public int getBreakSecondsOrDefault() {
        return breakSeconds == null ? 0 : breakSeconds;
    }
}
