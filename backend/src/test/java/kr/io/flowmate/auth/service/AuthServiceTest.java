package kr.io.flowmate.auth.service;

import io.jsonwebtoken.Claims;
import jakarta.servlet.http.HttpServletResponse;
import kr.io.flowmate.auth.domain.RefreshToken;
import kr.io.flowmate.auth.domain.SocialAccount;
import kr.io.flowmate.auth.domain.User;
import kr.io.flowmate.auth.dto.response.AuthorizeUrlResponse;
import kr.io.flowmate.auth.dto.response.GuestTokenResponse;
import kr.io.flowmate.auth.dto.response.LoginResponse;
import kr.io.flowmate.auth.dto.response.UserResponse;
import kr.io.flowmate.auth.exception.AuthenticationFailedException;
import kr.io.flowmate.auth.jwt.JwtProperties;
import kr.io.flowmate.auth.jwt.JwtProvider;
import kr.io.flowmate.auth.oauth.OAuthProvider;
import kr.io.flowmate.auth.oauth.OAuthProviderRegistry;
import kr.io.flowmate.auth.oauth.OAuthUserInfo;
import kr.io.flowmate.auth.repository.RefreshTokenRepository;
import kr.io.flowmate.auth.repository.SocialAccountRepository;
import kr.io.flowmate.auth.repository.UserRepository;
import kr.io.flowmate.common.exception.NotFoundException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockHttpServletResponse;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
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
    @Mock private JwtProperties jwtProps;

    @InjectMocks
    private AuthService authService;

    private MockHttpServletResponse httpResponse;

    @BeforeEach
    void setUp() {
        httpResponse = new MockHttpServletResponse();
    }

    // -- Helper --
    private User createUser(String id, String email, String nickname) {
        User user = mock(User.class);
        lenient().when(user.getId()).thenReturn(id);
        lenient().when(user.getEmail()).thenReturn(email);
        lenient().when(user.getNickname()).thenReturn(nickname);
        return user;
    }

    private Claims mockStateClaims() {
        Claims claims = mock(Claims.class);
        lenient().when(claims.get("role", String.class)).thenReturn("state");
        return claims;
    }

    private void setupLoginMocks(String providerName, OAuthUserInfo userInfo) {
        OAuthProvider provider = mock(OAuthProvider.class);
        when(oAuthProviderRegistry.get(providerName)).thenReturn(provider);
        when(provider.exchangeCodeForToken("code")).thenReturn("social-token");
        when(provider.getUserInfo("social-token")).thenReturn(userInfo);
        lenient().when(jwtProps.getRefreshTtl()).thenReturn(1209600L);
        lenient().when(jwtProvider.generateAccessToken(any())).thenReturn("access-jwt");
    }

    // ===========================================
    @Nested
    @DisplayName("issueGuestToken")
    class IssueGuestToken {
        @Test
        @DisplayName("issueGuestToken: UUID 기반 게스트 토큰 발급")
        void issueGuestToken_returnsGuestToken() {
            // given
            when(jwtProvider.generateGuestToken(any())).thenReturn("guest-jwt");

            // when
            GuestTokenResponse result = authService.issueGuestToken();

            // then
            assertThat(result.guestToken()).isEqualTo("guest-jwt");
        }
    }

    // ===========================================
    @Nested
    @DisplayName("getAuthorizeUrl")
    class GetAuthorizeUrl {
        @Test
        @DisplayName("getAuthorizeUrl: provider URL + state 토큰 반환")
        void getAuthorizeUrl_returnsUrlAndState() {
            // given
            OAuthProvider provider = mock(OAuthProvider.class);
            when(oAuthProviderRegistry.get("kakao")).thenReturn(provider);
            when(jwtProvider.generateStateToken()).thenReturn("state-jwt");
            when(provider.generateAuthorizeUrl("state-jwt")).thenReturn("https://kakao/auth?state=state-jwt");

            // when
            AuthorizeUrlResponse result = authService.getAuthorizeUrl("kakao");

            // then
            assertThat(result.authorizeUrl()).contains("kakao");
            assertThat(result.state()).isEqualTo("state-jwt");
        }
    }

    // ===========================================
    @Nested
    @DisplayName("login")
    class Login {
        @Test
        @DisplayName("login: 신규 사용자 → User + SocialAccount 생성 + RT 발급")
        void login_newUser_createsUserAndReturnsTokens() {
            // given
            Claims stateClaims = mockStateClaims();
            when(jwtProvider.parseClaims("state-jwt")).thenReturn(Optional.of(stateClaims));

            OAuthUserInfo userInfo = new OAuthUserInfo("kakao-123", "test@test.com", "테스트");
            setupLoginMocks("kakao", userInfo);

            when(socialAccountRepository.findByProviderAndProviderUserId("kakao", "kakao-123"))
                    .thenReturn(Optional.empty());
            User newUser = createUser("user-1", "test@test.com", "테스트");
            when(userRepository.save(any(User.class))).thenReturn(newUser);
            when(refreshTokenRepository.findAllActiveByUserId(eq("user-1"), any(Instant.class)))
                    .thenReturn(List.of());

            // when
            LoginResponse result = authService.login("kakao", "code", "state-jwt", httpResponse);

            // then
            assertThat(result.accessToken()).isEqualTo("access-jwt");
            assertThat(result.user().id()).isEqualTo("user-1");
            verify(socialAccountRepository).save(any(SocialAccount.class));
            verify(refreshTokenRepository).save(any(RefreshToken.class));
        }

        @Test
        @DisplayName("login: 기존 사용자 → 프로필 동기화 + 기존 RT 폐기 + 새 RT 발급")
        void login_existingUser_syncsProfileAndRevokesOldRT() {
            // given
            Claims stateClaims = mockStateClaims();
            when(jwtProvider.parseClaims("state-jwt")).thenReturn(Optional.of(stateClaims));

            OAuthUserInfo userInfo = new OAuthUserInfo("kakao-123", "new@test.com", "새닉네임");
            setupLoginMocks("kakao", userInfo);

            SocialAccount existingAccount = SocialAccount.create("user-1", "kakao", "kakao-123");
            when(socialAccountRepository.findByProviderAndProviderUserId("kakao", "kakao-123"))
                    .thenReturn(Optional.of(existingAccount));

            User existingUser = createUser("user-1", "old@test.com", "이전닉네임");
            when(userRepository.findById("user-1")).thenReturn(Optional.of(existingUser));

            RefreshToken activeRT = mock(RefreshToken.class);
            when(refreshTokenRepository.findAllActiveByUserId(eq("user-1"), any(Instant.class)))
                    .thenReturn(List.of(activeRT));

            // when
            LoginResponse result = authService.login("kakao", "code", "state-jwt", httpResponse);

            // then
            verify(existingUser).updateProfile("new@test.com", "새닉네임");
            verify(activeRT).revoke();
            verify(refreshTokenRepository).save(any(RefreshToken.class));
        }

        @Test
        @DisplayName("login: 유효하지 않은 state JWT → AuthenticationFailedException")
        void login_invalidState_throwsAuthException() {
            // given
            when(jwtProvider.parseClaims("bad-state")).thenReturn(Optional.empty());

            // when & then
            assertThatThrownBy(() -> authService.login("kakao", "code", "bad-state", httpResponse))
                    .isInstanceOf(AuthenticationFailedException.class)
                    .hasMessageContaining("state");
        }

        @Test
        @DisplayName("login: role이 state가 아닌 JWT → AuthenticationFailedException")
        void login_nonStateRole_throwsAuthException() {
            // given
            Claims memberClaims = mock(Claims.class);
            when(memberClaims.get("role", String.class)).thenReturn("member");
            when(jwtProvider.parseClaims("member-jwt")).thenReturn(Optional.of(memberClaims));

            // when & then
            assertThatThrownBy(() -> authService.login("kakao", "code", "member-jwt", httpResponse))
                    .isInstanceOf(AuthenticationFailedException.class);
        }

        @Test
        @DisplayName("login: 기존 활성 RT 여러 개 → 모두 폐기")
        void login_multipleActiveRTs_allRevoked() {
            // given
            Claims stateClaims = mockStateClaims();
            when(jwtProvider.parseClaims("state-jwt")).thenReturn(Optional.of(stateClaims));

            OAuthUserInfo userInfo = new OAuthUserInfo("kakao-123", "test@test.com", "테스트");
            setupLoginMocks("kakao", userInfo);

            when(socialAccountRepository.findByProviderAndProviderUserId("kakao", "kakao-123"))
                    .thenReturn(Optional.empty());
            User newUser = createUser("user-1", "test@test.com", "테스트");
            when(userRepository.save(any(User.class))).thenReturn(newUser);

            RefreshToken rt1 = mock(RefreshToken.class);
            RefreshToken rt2 = mock(RefreshToken.class);
            when(refreshTokenRepository.findAllActiveByUserId(eq("user-1"), any(Instant.class)))
                    .thenReturn(List.of(rt1, rt2));

            // when
            authService.login("kakao", "code", "state-jwt", httpResponse);

            // then
            verify(rt1).revoke();
            verify(rt2).revoke();
        }
    }

    // ===========================================
    @Nested
    @DisplayName("refresh")
    class Refresh {
        @Test
        @DisplayName("refresh: 유효한 RT → 기존 revoke + 새 RT + 새 Access Token")
        void refresh_validRT_returnsNewTokens() {
            // given
            RefreshToken existingRT = RefreshToken.create("user-1", "hash", Instant.now().plusSeconds(86400));
            when(refreshTokenRepository.findByTokenHash(any())).thenReturn(Optional.of(existingRT));

            User user = createUser("user-1", "test@test.com", "테스트");
            when(userRepository.findById("user-1")).thenReturn(Optional.of(user));
            when(jwtProps.getRefreshTtl()).thenReturn(1209600L);
            when(jwtProvider.generateAccessToken("user-1")).thenReturn("new-access-jwt");

            // when
            LoginResponse result = authService.refresh("raw-token", httpResponse);

            // then
            assertThat(result.accessToken()).isEqualTo("new-access-jwt");
            assertThat(existingRT.getRevokedAt()).isNotNull();
            verify(refreshTokenRepository).save(any(RefreshToken.class));
        }

        @Test
        @DisplayName("refresh: RT 미발견 → AuthenticationFailedException (401)")
        void refresh_notFound_throwsAuthException() {
            // given
            when(refreshTokenRepository.findByTokenHash(any())).thenReturn(Optional.empty());

            // when & then
            assertThatThrownBy(() -> authService.refresh("unknown-token", httpResponse))
                    .isInstanceOf(AuthenticationFailedException.class)
                    .hasMessageContaining("유효하지 않은 Refresh Token");
        }

        @Test
        @DisplayName("refresh: 폐기된 RT → AuthenticationFailedException (401)")
        void refresh_revokedRT_throwsAuthException() {
            // given
            RefreshToken revokedRT = RefreshToken.create("user-1", "hash", Instant.now().plusSeconds(86400));
            revokedRT.revoke();
            when(refreshTokenRepository.findByTokenHash(any())).thenReturn(Optional.of(revokedRT));

            // when & then
            assertThatThrownBy(() -> authService.refresh("revoked-token", httpResponse))
                    .isInstanceOf(AuthenticationFailedException.class)
                    .hasMessageContaining("만료 또는 폐기");
        }

        @Test
        @DisplayName("refresh: 만료된 RT → AuthenticationFailedException (401)")
        void refresh_expiredRT_throwsAuthException() {
            // given
            RefreshToken expiredRT = RefreshToken.create("user-1", "hash", Instant.now().minusSeconds(1));
            when(refreshTokenRepository.findByTokenHash(any())).thenReturn(Optional.of(expiredRT));

            // when & then
            assertThatThrownBy(() -> authService.refresh("expired-token", httpResponse))
                    .isInstanceOf(AuthenticationFailedException.class);
        }
    }

    // ===========================================
    @Nested
    @DisplayName("logout")
    class Logout {
        @Test
        @DisplayName("logout: RT 있으면 revoke + 쿠키 삭제")
        void logout_withRT_revokesAndClearsCookie() {
            // given
            RefreshToken rt = RefreshToken.create("user-1", "hash", Instant.now().plusSeconds(86400));
            when(refreshTokenRepository.findByTokenHash(any())).thenReturn(Optional.of(rt));

            // when
            authService.logout("raw-token", httpResponse);

            // then
            assertThat(rt.getRevokedAt()).isNotNull();
            assertThat(httpResponse.getHeader("Set-Cookie")).contains("refreshToken");
        }

        @Test
        @DisplayName("logout: RT null이면 revoke 없이 쿠키만 삭제")
        void logout_nullRT_onlyClearsCookie() {
            // when
            authService.logout(null, httpResponse);

            // then
            verifyNoInteractions(refreshTokenRepository);
            assertThat(httpResponse.getHeader("Set-Cookie")).contains("refreshToken");
        }
    }

    // ===========================================
    @Nested
    @DisplayName("me")
    class Me {
        @Test
        @DisplayName("me: 사용자 존재 → UserResponse 반환")
        void me_existingUser_returnsUserResponse() {
            // given
            User user = createUser("user-1", "test@test.com", "테스트");
            when(userRepository.findById("user-1")).thenReturn(Optional.of(user));

            // when
            UserResponse result = authService.me("user-1");

            // then
            assertThat(result.id()).isEqualTo("user-1");
            assertThat(result.email()).isEqualTo("test@test.com");
        }

        @Test
        @DisplayName("me: 사용자 미존재 → NotFoundException (404)")
        void me_notFound_throwsNotFoundException() {
            // given
            when(userRepository.findById("unknown")).thenReturn(Optional.empty());

            // when & then
            assertThatThrownBy(() -> authService.me("unknown"))
                    .isInstanceOf(NotFoundException.class);
        }
    }
}
