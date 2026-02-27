package kr.io.flowmate.auth.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "auth_refresh_tokens")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class RefreshToken {

    @Id
    @Column(length = 36)
    private String id;

    @Column(name = "user_id", nullable = false, length = 36)
    private String userId;

    @Column(name = "token_hash", nullable = false, length = 255)
    private String tokenHash;   // SHA-256 해시 저장

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "revoked_at")
    private Instant revokedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    public static RefreshToken create(String userId, String tokenHash, Instant expiresAt) {
        RefreshToken rt = new RefreshToken();
        rt.id = UUID.randomUUID().toString();
        rt.userId = userId;
        rt.tokenHash = tokenHash;
        rt.expiresAt = expiresAt;
        rt.createdAt = Instant.now();
        return rt;
    }

    /**
     * revoke(폐기)되지 않고 만료되지 않은 경우 true
     */
    public boolean isValid() {
        return revokedAt == null && expiresAt.isAfter(Instant.now());
    }

    public void revoke() {
        this.revokedAt = Instant.now();
    }

}
