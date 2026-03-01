package kr.io.flowmate.auth.service;

import jakarta.servlet.http.HttpServletResponse;
import kr.io.flowmate.auth.domain.RefreshToken;
import kr.io.flowmate.auth.domain.SocialAccount;
import kr.io.flowmate.auth.domain.User;
import kr.io.flowmate.auth.dto.*;
import kr.io.flowmate.auth.jwt.JwtProperties;
import kr.io.flowmate.auth.jwt.JwtProvider;
import kr.io.flowmate.auth.oauth.OAuthProvider;
import kr.io.flowmate.auth.oauth.OAuthProviderRegistry;
import kr.io.flowmate.auth.oauth.OAuthUserInfo;
import kr.io.flowmate.auth.repository.RefreshTokenRepository;
import kr.io.flowmate.auth.repository.SocialAccountRepository;
import kr.io.flowmate.auth.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Optional;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class AuthService {

    @Value("${cookie.secure:false}")
    private boolean cookieSecure;

    private final JwtProvider jwtProvider;
    private final OAuthProviderRegistry oAuthProviderRegistry;
    private final UserRepository userRepository;
    private final SocialAccountRepository socialAccountRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final JwtProperties jwtProps;

    /**
     * 게스트 JWT 발급
     */
    public GuestTokenResponse issueGuestToken() {
        String clientId = UUID.randomUUID().toString();
        return new GuestTokenResponse(jwtProvider.generateGuestToken(clientId));
    }

    /**
     * 소셜 로그인 URL + state 발급
     */
    public AuthorizeUrlResponse getAuthorizeUrl(String providerName) {
        OAuthProvider provider = oAuthProviderRegistry.get(providerName);
        String stateToken = jwtProvider.generateStateToken();
        String url = provider.generateAuthorizeUrl(stateToken);
        return new AuthorizeUrlResponse(url, stateToken);
    }

    /**
     * 소셜 인가코드 교환 -> 로그인 처리
     */
    @Transactional
    public LoginResponse login(String providerName, String code,
                               String stateToken, HttpServletResponse httpResponse) {
        // 1. state JWT 검증 (서명 + role=state 확인)
        if (!jwtProvider.validateToken(stateToken)
                || !"state".equals(jwtProvider.extractRole(stateToken))) {
            throw new IllegalArgumentException("유효하지 않은 state입니다.");
        }

        // 2. provider 선택
        OAuthProvider provider = oAuthProviderRegistry.get(providerName);

        // 3. 소셜 Access Token 교환
        String socialAccessToken = provider.exchangeCodeForToken(code);

        // 4. 사용자 정보 조회
        OAuthUserInfo userInfo = provider.getUserInfo(socialAccessToken);

        // 5. SocialAccount 조회 -> 없으면 User + SocialAccount 신규 생성
        Optional<SocialAccount> existingAccount = socialAccountRepository
                .findByProviderAndProviderUserId(providerName, userInfo.providerId());
        boolean isNewUser = existingAccount.isEmpty();

        SocialAccount socialAccount = existingAccount.orElseGet(() -> {
            User newUser = userRepository.save(
                    User.create(userInfo.email(), userInfo.nickname()));
            return socialAccountRepository.save(
                    SocialAccount.create(newUser.getId(), providerName, userInfo.providerId())
            );
        });

        // 6. 기존 회원이면 소셜 프로필 동기화 (신규 회원은 create에서 이미 설정됨)
        User user = userRepository.findById(socialAccount.getUserId())
                .orElseThrow(() -> new IllegalStateException("사용자를 찾을 수 없습니다."));
        if (!isNewUser) {
            user.updateProfile(userInfo.email(), userInfo.nickname());
        }

        // 7. 새 Refresh Token 발급 -> SHA-256 해시 -> DB 저장
        String rawRefreshToken = UUID.randomUUID().toString();
        String tokenHash = sha256(rawRefreshToken);
        Instant expiresAt = Instant.now().plusSeconds(jwtProps.getRefreshTtl());
        refreshTokenRepository.save(RefreshToken.create(user.getId(), tokenHash, expiresAt));

        // 8. Refresh Token -> HttpOnly 쿠키
        setRefreshCookie(httpResponse, rawRefreshToken, (int) jwtProps.getRefreshTtl());

        // 9. Access JWT 발급
        String accessToken = jwtProvider.generateAccessToken(user.getId());
        return new LoginResponse(accessToken, UserResponse.from(user));
    }

    /**
     * Access Token 재발급 (RTR: 기존 RT revoke + 새 RT 발급 + 쿠키 교체)
     */
    @Transactional
    public LoginResponse refresh(String rawRefreshToken, HttpServletResponse httpResponse) {
        String tokenHash = sha256(rawRefreshToken);

        RefreshToken refreshToken = refreshTokenRepository.findByTokenHash(tokenHash)
                .orElseThrow(() -> new IllegalArgumentException("유효하지 않은 Refresh Token"));

        if (!refreshToken.isValid()) {
            throw new IllegalArgumentException("만료 또는 폐기된 Refresh Token");
        }

        User user = userRepository.findById(refreshToken.getUserId())
                .orElseThrow(() -> new IllegalStateException("사용자를 찾을 수 없습니다."));

        // RTR: 기존 RT revoke + 새 RT 발급 + 쿠키 교체
        refreshToken.revoke();
        String newRaw = UUID.randomUUID().toString();
        Instant expiresAt = Instant.now().plusSeconds(jwtProps.getRefreshTtl());
        refreshTokenRepository.save(RefreshToken.create(user.getId(), sha256(newRaw), expiresAt));
        setRefreshCookie(httpResponse, newRaw, (int) jwtProps.getRefreshTtl());

        return new LoginResponse(jwtProvider.generateAccessToken(user.getId()), UserResponse.from(user));
    }

    /**
     * 로그아웃
     */
    @Transactional
    public void logout(String refreshToken, HttpServletResponse httpResponse) {
        if (refreshToken != null) {
            refreshTokenRepository.findByTokenHash(sha256(refreshToken))
                    .ifPresent(RefreshToken::revoke);
        }
        clearRefreshCookie(httpResponse);
    }

    /**
     * 내 정보
     */
    public UserResponse me(String userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalStateException("사용자를 찾을 수 없습니다."));
        return UserResponse.from(user);
    }

    /* Helpers */
    private void clearRefreshCookie(HttpServletResponse response) {
        ResponseCookie cookie = ResponseCookie.from("refreshToken", "")
                .httpOnly(true)
                .sameSite("Lax")
                .path("/api/auth")
                .maxAge(0)
                .build();
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }

    private void setRefreshCookie(HttpServletResponse response, String token, int maxAge) {
        ResponseCookie cookie = ResponseCookie.from("refreshToken", token)
                .httpOnly(true)
                .sameSite("Lax")
                .path("/api/auth")
                .maxAge(maxAge)
                .secure(cookieSecure)
                .build();
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }

    private String sha256(String input) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(input.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException(e);
        }
    }
}
