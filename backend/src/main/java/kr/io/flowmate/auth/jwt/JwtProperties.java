package kr.io.flowmate.auth.jwt;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "jwt")
@Getter
@Setter
public class JwtProperties {

    private String secret;
    private long accessTtl;    // 초, 회원 Access Token
    private long guestTtl;     // 초, 게스트 Token
    private long stateTtl;     // 초, state JWT
    private long refreshTtl;   // 초, Refresh Token 만료일 계산용

}
