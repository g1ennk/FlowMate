package kr.io.flowmate.auth.dto;

import kr.io.flowmate.auth.domain.User;

public record UserResponse(String id, String email, String nickname) {
    public static UserResponse from(User user) {
        return new UserResponse(user.getId(), user.getEmail(), user.getNickname());
    }
}
