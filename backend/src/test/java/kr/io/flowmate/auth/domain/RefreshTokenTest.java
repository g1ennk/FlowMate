package kr.io.flowmate.auth.domain;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

@DisplayName("RefreshToken")
class RefreshTokenTest {

    @Test
    @DisplayName("isValid: 미만료 + 미폐기면 true")
    void isValid_notExpiredNotRevoked_returnsTrue() {
        RefreshToken rt = RefreshToken.create("user-1", "hash",
                Instant.now().plusSeconds(3600));

        assertThat(rt.isValid()).isTrue();
    }

    @Test
    @DisplayName("isValid: 만료되면 false")
    void isValid_expired_returnsFalse() {
        RefreshToken rt = RefreshToken.create("user-1", "hash",
                Instant.now().minusSeconds(1));

        assertThat(rt.isValid()).isFalse();
    }

    @Test
    @DisplayName("revoke: 폐기 후 isValid false + revokedAt 설정")
    void revoke_setsRevokedAtAndInvalidates() {
        RefreshToken rt = RefreshToken.create("user-1", "hash",
                Instant.now().plusSeconds(3600));

        rt.revoke();

        assertThat(rt.isValid()).isFalse();
        assertThat(rt.getRevokedAt()).isNotNull();
    }
}
