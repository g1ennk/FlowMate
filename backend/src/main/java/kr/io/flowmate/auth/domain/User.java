package kr.io.flowmate.auth.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import kr.io.flowmate.common.domain.BaseTimeEntity;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.UUID;

@Entity
@Table(name = "users")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class User extends BaseTimeEntity {

    @Id
    @Column(length = 36)
    private String id;

    @Column(length = 255)
    private String email;

    @Column(length = 100)
    private String nickname;

    public static User create(String email, String nickname) {
        User u = new User();
        u.id = UUID.randomUUID().toString();
        u.email = email;
        u.nickname = nickname;
        return u;
    }

    public void updateProfile(String email, String nickname) {
        this.email = email;
        this.nickname = nickname;
    }
}
