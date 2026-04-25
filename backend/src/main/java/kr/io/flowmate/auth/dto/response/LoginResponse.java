package kr.io.flowmate.auth.dto.response;

public record LoginResponse(String accessToken, UserResponse user) {
}
