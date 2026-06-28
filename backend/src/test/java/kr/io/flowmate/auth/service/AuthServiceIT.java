package kr.io.flowmate.auth.service;

import jakarta.servlet.http.HttpServletResponse;
import kr.io.flowmate.auth.domain.RefreshToken;
import kr.io.flowmate.auth.domain.User;
import kr.io.flowmate.auth.repository.RefreshTokenRepository;
import kr.io.flowmate.auth.repository.UserRepository;
import kr.io.flowmate.common.exception.AuthenticationFailedException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
@ActiveProfiles("test")
@DisplayName("AuthService (IT)")
class AuthServiceIT {

    @Autowired private AuthService authService;
    @Autowired private UserRepository userRepository;
    @Autowired private RefreshTokenRepository refreshTokenRepository;

    @MockitoBean
    private RedisMessageListenerContainer redisMessageListenerContainer;

    private HttpServletResponse httpResponse;

    @BeforeEach
    void setUp() {
        refreshTokenRepository.deleteAll();
        userRepository.deleteAll();
        httpResponse = new MockHttpServletResponse();
    }

    @Test
    @DisplayName("revoked RT 재사용은 401을 반환해도 같은 사용자의 active RT 전체 revoke를 커밋한다")
    void refresh_reusedRevokedToken_commitsRevokeAllDespiteAuthFailure() {
        User user = userRepository.save(User.create("user@test.com", "유저"));
        User otherUser = userRepository.save(User.create("other@test.com", "다른 유저"));
        saveRevokedToken(user.getId(), sha256("reused-token"));
        RefreshToken active = saveActiveToken(user.getId(), "active-token-hash");
        RefreshToken otherUserActive = saveActiveToken(otherUser.getId(), "other-active-token-hash");
        refreshTokenRepository.flush();

        assertThatThrownBy(() -> authService.refresh("reused-token", httpResponse))
                .isInstanceOf(AuthenticationFailedException.class);

        assertRevoked(active);
        assertActive(otherUserActive);
    }

    @Test
    @DisplayName("유효한 RT refresh는 현재 RT만 revoke하고 같은 사용자의 다른 active RT는 유지한다")
    void refresh_validToken_rotatesOnlyCurrentToken() {
        User user = userRepository.save(User.create("rotate@test.com", "회전 유저"));
        RefreshToken current = saveActiveToken(user.getId(), sha256("current-token"));
        RefreshToken sibling = saveActiveToken(user.getId(), "sibling-token-hash");
        refreshTokenRepository.flush();

        authService.refresh("current-token", httpResponse);

        assertRevoked(current);
        assertActive(sibling);
        assertThat(refreshTokenRepository.findAll()).filteredOn(token ->
                token.getUserId().equals(user.getId())
                        && token.getRevokedAt() == null
                        && !token.getId().equals(sibling.getId())
        ).hasSize(1);
    }

    @Test
    @DisplayName("만료됐지만 revoke되지 않은 RT는 401이어도 active RT 전체 revoke를 하지 않는다")
    void refresh_expiredToken_doesNotRevokeOtherActiveTokens() {
        User user = userRepository.save(User.create("expired@test.com", "만료 유저"));
        refreshTokenRepository.save(RefreshToken.create(
                user.getId(), sha256("expired-token"), Instant.now().minusSeconds(1)));
        RefreshToken active = saveActiveToken(user.getId(), "expired-sibling-token-hash");
        refreshTokenRepository.flush();

        assertThatThrownBy(() -> authService.refresh("expired-token", httpResponse))
                .isInstanceOf(AuthenticationFailedException.class);

        assertActive(active);
    }

    private RefreshToken saveActiveToken(String userId, String tokenHash) {
        return refreshTokenRepository.save(
                RefreshToken.create(userId, tokenHash, Instant.now().plusSeconds(3600)));
    }

    private void saveRevokedToken(String userId, String tokenHash) {
        RefreshToken token = RefreshToken.create(userId, tokenHash, Instant.now().plusSeconds(3600));
        token.revoke();
        refreshTokenRepository.saveAndFlush(token);
    }

    private void assertRevoked(RefreshToken token) {
        assertThat(refreshTokenRepository.findById(token.getId()))
                .get()
                .extracting(RefreshToken::getRevokedAt)
                .isNotNull();
    }

    private void assertActive(RefreshToken token) {
        assertThat(refreshTokenRepository.findById(token.getId()))
                .get()
                .extracting(RefreshToken::getRevokedAt)
                .isNull();
    }

    private static String sha256(String value) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            return java.util.HexFormat.of().formatHex(md.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
