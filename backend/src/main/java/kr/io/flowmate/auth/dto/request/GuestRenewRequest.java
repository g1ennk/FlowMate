package kr.io.flowmate.auth.dto.request;

import jakarta.validation.constraints.NotBlank;

public record GuestRenewRequest(
        @NotBlank(message = "guestToken은 필수입니다.") String guestToken
) {
}
