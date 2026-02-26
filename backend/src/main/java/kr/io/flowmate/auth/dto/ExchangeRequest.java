package kr.io.flowmate.auth.dto;

import jakarta.validation.constraints.NotBlank;

public record ExchangeRequest(
        @NotBlank(message = "code는 필수입니다.") String code,
        @NotBlank(message = "state는 필수입니다.") String state
) {
}
