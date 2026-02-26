package kr.io.flowmate.auth.jwt;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.time.Instant;
import java.util.Date;
import java.util.HexFormat;

@Component
@RequiredArgsConstructor
public class JwtProvider {

    private final JwtProperties props;

    private SecretKey secretKey() {
        byte[] keyBytes = HexFormat.of().parseHex(props.getSecret());
        return Keys.hmacShaKeyFor(keyBytes);
    }

    /**
     * 게스트 JWT: role=guest, sub=clientId
     */
    public String generateGuestToken(String clientId) {
        return buildToken(clientId, "guest", props.getGuestTtl());
    }

    /**
     * 회원 Access JWT: role=member, sub=userId
     */
    public String generateAccessToken(String userId) {
        return buildToken(userId, "member", props.getAccessTtl());
    }

    /**
     * state JWT: role=state, sub=randomUUID, TTL=5분
     */
    public String generateStateToken() {
        return buildToken(java.util.UUID.randomUUID().toString(), "state", props.getStateTtl());
    }

    private String buildToken(String subject, String role, long ttlSeconds) {
        Instant now = Instant.now();
        return Jwts.builder()
                .subject(subject)
                .claim("role", role)
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plusSeconds(ttlSeconds)))
                .signWith(secretKey())
                .compact();
    }

    /**
     * 파싱 - 서명 오류/만료 시 JwtException 발생
     */
    public Claims parseToken(String token) {
        return Jwts.parser()
                .verifyWith(secretKey())
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    public boolean validateToken(String token) {
        try {
            parseToken(token);
            return true;
        } catch (JwtException | IllegalArgumentException e) {
            return false;
        }
    }

    public String extractSubject(String token) {
        return parseToken(token).getSubject();
    }

    public String extractRole(String token) {
        return parseToken(token).get("role", String.class);
    }
}
