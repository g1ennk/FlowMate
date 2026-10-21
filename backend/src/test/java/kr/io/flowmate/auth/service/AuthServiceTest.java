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
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.mock.web.MockHttpServletResponse;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("AuthService")
class AuthServiceTest {

    @Mock private JwtProvider jwtProvider;
    @Mock private OAuthProviderRegistry oAuthProviderRegistry;
    @Mock private UserRepository userRepository;
    @Mock private SocialAccountRepository socialAccountRepository;
    @Mock private RefreshTokenRepository refreshTokenRepository;
    @Mock private RefreshTokenRevoker refreshTokenRevoker;
    @Mock private SocialAccountRegistrar socialAccountRegistrar;
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
        when(socialAccountRegistrar.register(eq("kakao"), any(OAuthUserInfo.class))).thenReturn(newUser);
        when(jwtProps.getRefreshTtl()).thenReturn(1209600L);
        when(jwtProvider.generateAccessToken(newUser.getId())).thenReturn("access-jwt");

        LoginResponse result = authService.login("kakao", "code", "valid-state", httpResponse);

        assertThat(result.accessToken()).isEqualTo("access-jwt");
        assertThat(result.user().nickname()).isEqualTo("테스터");
        verify(socialAccountRegistrar, never()).findRegistered(anyString(), anyString());
        verify(refreshTokenRepository).save(any(RefreshToken.class));
        // 로그인은 기존 RT를 revoke하지 않음 (디바이스별 공존)
        verify(refreshTokenRevoker, never()).revokeAll(anyString());
    }

    @Test
    @DisplayName("login: 동시 첫 로그인에서 가입이 uq_provider_user 충돌이면 먼저 가입한 회원으로 로그인")
    void login_concurrentFirstLogin_conflict_logsInAsRegisteredUser() {
        stubValidStateAndOAuth();
        when(socialAccountRepository.findByProviderAndProviderUserId("kakao", "kakao-123"))
                .thenReturn(Optional.empty());

        User winner = User.create("test@kakao.com", "테스터");
        when(socialAccountRegistrar.register(eq("kakao"), any(OAuthUserInfo.class)))
                .thenThrow(new DataIntegrityViolationException("uq_provider_user"));
        when(socialAccountRegistrar.findRegistered("kakao", "kakao-123")).thenReturn(Optional.of(winner));
        when(jwtProps.getRefreshTtl()).thenReturn(1209600L);
        when(jwtProvider.generateAccessToken(winner.getId())).thenReturn("access-jwt");

        LoginResponse result = authService.login("kakao", "code", "valid-state", httpResponse);

        assertThat(result.user().id()).isEqualTo(winner.getId());
        verify(refreshTokenRepository).save(any(RefreshToken.class));
    }

    @Test
    @DisplayName("login: 가입 충돌 후에도 회원을 찾지 못하면 원래 충돌 예외를 그대로 던진다")
    void login_conflictWithoutRegisteredUser_rethrows() {
        stubValidStateAndOAuth();
        when(socialAccountRepository.findByProviderAndProviderUserId("kakao", "kakao-123"))
                .thenReturn(Optional.empty());
        DataIntegrityViolationException conflict = new DataIntegrityViolationException("other constraint");
        when(socialAccountRegistrar.register(eq("kakao"), any(OAuthUserInfo.class))).thenThrow(conflict);
        when(socialAccountRegistrar.findRegistered("kakao", "kakao-123")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> authService.login("kakao", "code", "valid-state", httpResponse))
                .isSameAs(conflict);
        verify(refreshTokenRepository, never()).save(any(RefreshToken.class));
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
        verify(refreshTokenRevoker, never()).revokeAll(anyString());
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

        when(refreshTokenRepository.findByTokenHash(anyString()))
                .thenReturn(Optional.of(revokedRt));

        assertThatThrownBy(() -> authService.refresh("stolen", httpResponse))
                .isInstanceOf(AuthenticationFailedException.class);

        verify(refreshTokenRevoker).revokeAll("user-1");
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

        // 만료(revokedAt=null)는 reuse가 아니므로 revoke-all 호출 안 함
        verify(refreshTokenRevoker, never()).revokeAll(anyString());
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

    // ── renewGuestToken ──

    @Test
    @DisplayName("renewGuestToken: 만료된 게스트 토큰도 서명이 유효하면 같은 clientId로 재발급")
    void renewGuestToken_expiredButSigned_reissuesSameSubject() {
        Claims guestClaims = Jwts.claims()
                .subject("client-1")
                .add("role", "guest")
                .expiration(java.util.Date.from(Instant.now().minusSeconds(86400)))
                .build();
        when(jwtProvider.parseTokenAllowingExpired("old-guest")).thenReturn(guestClaims);
        when(jwtProps.getGuestTtl()).thenReturn(7776000L);
        when(jwtProvider.generateGuestToken("client-1")).thenReturn("renewed-guest");

        assertThat(authService.renewGuestToken("old-guest").guestToken()).isEqualTo("renewed-guest");
    }

    @Test
    @DisplayName("renewGuestToken: 만료 후 게스트 TTL보다 오래 지난 토큰은 거부")
    void renewGuestToken_expiredTooLongAgo_throwsAuthFailed() {
        Claims guestClaims = Jwts.claims()
                .subject("client-1")
                .add("role", "guest")
                .expiration(java.util.Date.from(Instant.now().minusSeconds(7776000L + 60)))
                .build();
        when(jwtProvider.parseTokenAllowingExpired("ancient-guest")).thenReturn(guestClaims);
        when(jwtProps.getGuestTtl()).thenReturn(7776000L);

        assertThatThrownBy(() -> authService.renewGuestToken("ancient-guest"))
                .isInstanceOf(AuthenticationFailedException.class);
        verify(jwtProvider, never()).generateGuestToken(anyString());
    }

    @Test
    @DisplayName("renewGuestToken: 게스트가 아닌 토큰(member/state)은 거부")
    void renewGuestToken_nonGuestRole_throwsAuthFailed() {
        Claims memberClaims = Jwts.claims()
                .subject("user-1")
                .add("role", "member")
                .expiration(java.util.Date.from(Instant.now().plusSeconds(600)))
                .build();
        when(jwtProvider.parseTokenAllowingExpired("member-token")).thenReturn(memberClaims);

        assertThatThrownBy(() -> authService.renewGuestToken("member-token"))
                .isInstanceOf(AuthenticationFailedException.class);
        verify(jwtProvider, never()).generateGuestToken(anyString());
    }

    @Test
    @DisplayName("renewGuestToken: 서명 오류 등 파싱 실패 시 AuthenticationFailedException")
    void renewGuestToken_invalidSignature_throwsAuthFailed() {
        when(jwtProvider.parseTokenAllowingExpired("forged"))
                .thenThrow(new JwtException("bad signature"));

        assertThatThrownBy(() -> authService.renewGuestToken("forged"))
                .isInstanceOf(AuthenticationFailedException.class);
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
