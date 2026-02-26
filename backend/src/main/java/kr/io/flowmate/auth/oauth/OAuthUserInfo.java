package kr.io.flowmate.auth.oauth;

public record OAuthUserInfo(
        String providerId, // 소셜 서버의 사용자 고유 ID
        String email, // nullable
        String nickname
) {
}
