package kr.io.flowmate.auth.oauth;

public interface OAuthProvider {
    /**
     * Provider 식별자 - "kakao", "google", "naver" 등
     */
    String getProviderName();

    /**
     * 소셜 로그인 페이지 URL 생성
     */
    String generateAuthorizeUrl(String stateToken);

    /**
     * 인가코드 -> 소셜 Access Token 교환
     */
    String exchangeCodeForToken(String code);

    /**
     * 소셜 Access Token -> 사용자 정보 조회
     */
    OAuthUserInfo getUserInfo(String accessToken);
}
