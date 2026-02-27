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
@Table(name = "auth_social_accounts")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class SocialAccount {

    @Id
    @Column(length = 36)
    private String id;

    @Column(name = "user_id", nullable = false, length = 36)
    private String userId;

    @Column(nullable = false, length = 20)
    private String provider;

    @Column(name = "provider_user_id", nullable = false, length = 100)
    private String providerUserId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    public static SocialAccount create(String userId, String provider, String providerUserId) {
        SocialAccount sa = new SocialAccount();
        sa.id = UUID.randomUUID().toString();
        sa.userId = userId;
        sa.provider = provider;
        sa.providerUserId = providerUserId;
        sa.createdAt = Instant.now();
        return sa;
    }

}
