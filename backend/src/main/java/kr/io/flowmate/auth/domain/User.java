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
@Table(name = "users")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class User {

    @Id
    @Column(length = 36)
    private String id;

    @Column(length = 255)
    private String email;

    @Column(length = 100)
    private String nickname;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public static User create(String email, String nickname) {
        User u = new User();
        Instant now = Instant.now();
        u.id = UUID.randomUUID().toString();
        u.email = email;
        u.nickname = nickname;
        u.createdAt = now;
        u.updatedAt = now;
        return u;
    }

    public void updateProfile(String email, String nickname) {
        this.email = email;
        this.nickname = nickname;
        this.updatedAt = Instant.now();
    }
}
