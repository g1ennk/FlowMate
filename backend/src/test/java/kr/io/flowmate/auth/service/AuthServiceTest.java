package kr.io.flowmate.auth.service;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import kr.io.flowmate.auth.domain.RefreshToken;
import kr.io.flowmate.auth.domain.SocialAccount;
import kr.io.flowmate.auth.domain.User;
import kr.io.flowmate.auth.dto.response.LoginResponse;
import kr.io.flowmate.auth.jwt.JwtProperties;
import kr.io.flowmate.auth.jwt.JwtProvider;
import kr.io.flowmate.auth.oauth.OAuthProvider;
import kr.io.flowmate.auth.oauth.OAuthProviderRegistry;
import kr.io.flowmate.auth.oauth.OAuthUserInfo;
import kr.io.flowmate.auth.repository.RefreshTokenRepository;
import kr.io.flowmate.auth.repository.SocialAccountRepository;
import kr.io.flowmate.auth.repository.UserRepository;
import kr.io.flowmate.common.exception.AuthenticationFailedException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockHttpServletResponse;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("AuthService")
class AuthServiceTest {

    @Mock private JwtProvider jwtProvider;
    @Mock private OAuthProviderRegistry oAuthProviderRegistry;
    @Mock private UserRepository userRepository;
    @Mock private SocialAccountRepository socialAccountRepository;
    @Mock private RefreshTokenRepository refreshTokenRepository;
    @Mock private JwtProperties jwtProps;
    @Mock private OAuthProvider oAuthProvider;

    @InjectMocks
    private AuthService authService;

    private MockHttpServletResponse httpResponse;

    @BeforeEach
    void setUp() {
        httpResponse = new MockHttpServletResponse();
    }

    // ── login: state 검증 ──

    @Test
    @DisplayName("login: state 토큰 파싱 실패(서명오류/만료) 시 AuthenticationFailedException")
    void login_invalidStateToken_throwsAuthFailed() {
        when(jwtProvider.parseToken("bad-state"))
                .thenThrow(new JwtException("invalid"));

        assertThatThrownBy(() ->
                authService.login("kakao", "code", "bad-state", httpResponse))
                .isInstanceOf(AuthenticationFailedException.class)
                .hasMessageContaining("state");
    }

    @Test
    @DisplayName("login: state 토큰의 role이 state가 아니면 AuthenticationFailedException")
    void login_stateTokenWrongRole_throwsAuthFailed() {
        Claims memberClaims = Jwts.claims()
                .subject("user-1")
                .add("role", "member")
                .build();
        when(jwtProvider.parseToken("member-token")).thenReturn(memberClaims);

        assertThatThrownBy(() ->
                authService.login("kakao", "code", "member-token", httpResponse))
                .isInstanceOf(AuthenticationFailedException.class)
                .hasMessageContaining("state");
    }

    // ── login: 신규/기존 사용자 ──

    @Test
    @DisplayName("login: 신규 사용자면 User + SocialAccount 생성 후 토큰 반환")
    void login_newUser_createsUserAndReturnsTokens() {
        stubValidStateAndOAuth();

        when(socialAccountRepository.findByProviderAndProviderUserId("kakao", "kakao-123"))
                .thenReturn(Optional.empty());

        User newUser = User.create("test@kakao.com", "테스터");
        when(userRepository.save(any(User.class))).thenReturn(newUser);

        SocialAccount sa = SocialAccount.create(newUser.getId(), "kakao", "kakao-123");
        when(socialAccountRepository.save(any(SocialAccount.class))).thenReturn(sa);
        when(userRepository.findById(newUser.getId())).thenReturn(Optional.of(newUser));
        when(jwtProps.getRefreshTtl()).thenReturn(1209600L);
        when(jwtProvider.generateAccessToken(newUser.getId())).thenReturn("access-jwt");

        LoginResponse result = authService.login("kakao", "code", "valid-state", httpResponse);

        assertThat(result.accessToken()).isEqualTo("access-jwt");
        assertThat(result.user().nickname()).isEqualTo("테스터");
        verify(userRepository).save(any(User.class));
        verify(refreshTokenRepository).save(any(RefreshToken.class));
        // 로그인은 기존 RT를 revoke하지 않음 (디바이스별 공존)
        verify(refreshTokenRepository, never()).findAllActiveByUserId(anyString(), any(Instant.class));
    }

    @Test
    @DisplayName("login: 기존 사용자면 프로필 동기화 + 기존 RT 유지 + 새 RT 발급")
    void login_existingUser_syncsProfileAndKeepsOldTokens() {
        stubValidStateAndOAuth();

        User existingUser = User.create("old@kakao.com", "옛이름");
        SocialAccount existingSa = SocialAccount.create(existingUser.getId(), "kakao", "kakao-123");

        when(socialAccountRepository.findByProviderAndProviderUserId("kakao", "kakao-123"))
                .thenReturn(Optional.of(existingSa));
        when(userRepository.findById(existingUser.getId())).thenReturn(Optional.of(existingUser));

        // 기존 활성 RT 1개 존재 — 이 로그인으로 revoke되면 안 됨
        RefreshToken oldRt = RefreshToken.create(existingUser.getId(), "old-hash",
                Instant.now().plusSeconds(3600));
        when(jwtProps.getRefreshTtl()).thenReturn(1209600L);
        when(jwtProvider.generateAccessToken(existingUser.getId())).thenReturn("access-jwt");

        LoginResponse result = authService.login("kakao", "code", "valid-state", httpResponse);

        assertThat(result.accessToken()).isEqualTo("access-jwt");
        assertThat(existingUser.getNickname()).isEqualTo("테스터");
        assertThat(oldRt.getRevokedAt()).isNull(); // 기존 RT는 살아있다 (멀티디바이스 공존)
        verify(userRepository, never()).save(any(User.class));
        verify(refreshTokenRepository, never()).findAllActiveByUserId(anyString(), any(Instant.class));
        verify(refreshTokenRepository).save(any(RefreshToken.class)); // 새 RT는 발급됨
    }

    // ── refresh ──

    @Test
    @DisplayName("refresh: 유효한 RT면 기존 revoke + 새 RT 발급 + 새 access 반환")
    void refresh_validToken_rotatesAndReturnsNewAccess() {
        RefreshToken rt = RefreshToken.create("user-1", sha256("raw-token"),
                Instant.now().plusSeconds(3600));
        User user = User.create("u@test.com", "유저");

        when(refreshTokenRepository.findByTokenHash(anyString()))
                .thenReturn(Optional.of(rt));
        when(userRepository.findById(rt.getUserId())).thenReturn(Optional.of(user));
        when(jwtProps.getRefreshTtl()).thenReturn(1209600L);
        when(jwtProvider.generateAccessToken(user.getId())).thenReturn("new-access");

        LoginResponse result = authService.refresh("raw-token", httpResponse);

        assertThat(result.accessToken()).isEqualTo("new-access");
        assertThat(rt.getRevokedAt()).isNotNull();
        verify(refreshTokenRepository).save(any(RefreshToken.class));
    }

    @Test
    @DisplayName("refresh: 존재하지 않는 RT면 AuthenticationFailedException")
    void refresh_unknownToken_throwsAuthFailed() {
        when(refreshTokenRepository.findByTokenHash(anyString()))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> authService.refresh("unknown", httpResponse))
                .isInstanceOf(AuthenticationFailedException.class);
    }

    @Test
    @DisplayName("refresh: 폐기된 RT면 reuse detection — 해당 사용자 모든 활성 토큰 revoke")
    void refresh_revokedToken_revokesAllUserTokens() {
        RefreshToken revokedRt = RefreshToken.create("user-1", "hash",
                Instant.now().plusSeconds(3600));
        revokedRt.revoke();

        RefreshToken activeRt = RefreshToken.create("user-1", "other-hash",
                Instant.now().plusSeconds(3600));

        when(refreshTokenRepository.findByTokenHash(anyString()))
                .thenReturn(Optional.of(revokedRt));
        when(refreshTokenRepository.findAllActiveByUserId(eq("user-1"), any(Instant.class)))
                .thenReturn(List.of(activeRt));

        assertThatThrownBy(() -> authService.refresh("stolen", httpResponse))
                .isInstanceOf(AuthenticationFailedException.class);

        // reuse detection: 다른 활성 토큰도 revoke됨
        assertThat(activeRt.getRevokedAt()).isNotNull();
    }

    @Test
    @DisplayName("refresh: 만료된 RT(revokedAt=null)면 reuse detection 없이 AuthenticationFailedException")
    void refresh_expiredToken_throwsAuthFailedWithoutReuseDetection() {
        RefreshToken expiredRt = RefreshToken.create("user-1", "hash",
                Instant.now().minusSeconds(1)); // 이미 만료

        when(refreshTokenRepository.findByTokenHash(anyString()))
                .thenReturn(Optional.of(expiredRt));

        assertThatThrownBy(() -> authService.refresh("expired", httpResponse))
                .isInstanceOf(AuthenticationFailedException.class);

        // 만료(revokedAt=null)는 reuse가 아니므로 findAllActive 호출 안 함
        verify(refreshTokenRepository, never()).findAllActiveByUserId(anyString(), any());
    }

    // ── logout ──

    @Test
    @DisplayName("logout: 쿠키가 없어도 예외 없이 완료 + 쿠키 삭제 헤더")
    void logout_noCookie_completesAndClearsCookie() {
        authService.logout(null, httpResponse);

        assertThat(httpResponse.getHeader("Set-Cookie")).contains("refreshToken");
        assertThat(httpResponse.getHeader("Set-Cookie")).contains("Max-Age=0");
    }

    @Test
    @DisplayName("logout: 유효한 RT 쿠키면 revoke 후 쿠키 삭제")
    void logout_withCookie_revokesAndClears() {
        RefreshToken rt = RefreshToken.create("user-1", "hash",
                Instant.now().plusSeconds(3600));
        when(refreshTokenRepository.findByTokenHash(anyString()))
                .thenReturn(Optional.of(rt));

        authService.logout("raw-token", httpResponse);

        assertThat(rt.getRevokedAt()).isNotNull();
        assertThat(httpResponse.getHeader("Set-Cookie")).contains("Max-Age=0");
    }

    // ── helpers ──

    private void stubValidStateAndOAuth() {
        Claims stateClaims = Jwts.claims()
                .subject("random-uuid")
                .add("role", "state")
                .build();
        when(jwtProvider.parseToken("valid-state")).thenReturn(stateClaims);
        when(oAuthProviderRegistry.get("kakao")).thenReturn(oAuthProvider);
        when(oAuthProvider.exchangeCodeForToken("code")).thenReturn("social-access");
        when(oAuthProvider.getUserInfo("social-access"))
                .thenReturn(new OAuthUserInfo("kakao-123", "test@kakao.com", "테스터"));
    }

    private String sha256(String input) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(input.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }
}
