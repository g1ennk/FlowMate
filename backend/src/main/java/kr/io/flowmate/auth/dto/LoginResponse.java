package kr.io.flowmate.auth.dto;

public record LoginResponse(String accessToken, UserResponse user) {
}
