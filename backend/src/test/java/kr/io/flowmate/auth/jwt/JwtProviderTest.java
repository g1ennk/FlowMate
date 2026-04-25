package kr.io.flowmate.auth.jwt;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import javax.crypto.SecretKey;
import java.util.HexFormat;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

@DisplayName("JwtProvider")
class JwtProviderTest {

    // 64 hex chars = 32 bytes = HMAC-SHA256 minimum
    private static final String TEST_SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    private JwtProvider jwtProvider;

    @BeforeEach
    void setUp() {
        JwtProperties props = mock(JwtProperties.class);
        when(props.getSecret()).thenReturn(TEST_SECRET);
        when(props.getAccessTtl()).thenReturn(900L);
        when(props.getGuestTtl()).thenReturn(7776000L);
        when(props.getStateTtl()).thenReturn(300L);
        when(props.getRefreshTtl()).thenReturn(1209600L);

        jwtProvider = new JwtProvider(props);
        jwtProvider.initKey();
    }

    @Test
    @DisplayName("generateAccessToken + parseToken: member role + subject 정상 추출")
    void generateAccessToken_parseReturnsCorrectClaims() {
        String token = jwtProvider.generateAccessToken("user-42");

        Claims claims = jwtProvider.parseToken(token);
        assertThat(claims.getSubject()).isEqualTo("user-42");
        assertThat(claims.get("role", String.class)).isEqualTo("member");
    }

    @Test
    @DisplayName("generateGuestToken + parseToken: guest role + clientId subject")
    void generateGuestToken_parseReturnsGuestRole() {
        String token = jwtProvider.generateGuestToken("client-abc");

        Claims claims = jwtProvider.parseToken(token);
        assertThat(claims.getSubject()).isEqualTo("client-abc");
        assertThat(claims.get("role", String.class)).isEqualTo("guest");
    }

    @Test
    @DisplayName("generateStateToken + parseToken: state role + UUID subject")
    void generateStateToken_parseReturnsStateRole() {
        String token = jwtProvider.generateStateToken();

        Claims claims = jwtProvider.parseToken(token);
        assertThat(claims.get("role", String.class)).isEqualTo("state");
        assertThat(claims.getSubject()).isNotBlank();
    }

    @Test
    @DisplayName("validateToken: 유효한 토큰이면 true")
    void validateToken_validToken_returnsTrue() {
        String token = jwtProvider.generateAccessToken("user-1");

        assertThat(jwtProvider.validateToken(token)).isTrue();
    }

    @Test
    @DisplayName("validateToken: null이면 false")
    void validateToken_null_returnsFalse() {
        assertThat(jwtProvider.validateToken(null)).isFalse();
    }

    @Test
    @DisplayName("validateToken: 빈 문자열이�� false")
    void validateToken_empty_returnsFalse() {
        assertThat(jwtProvider.validateToken("")).isFalse();
    }

    @Test
    @DisplayName("parseToken: 다른 키로 서명된 토큰이면 JwtException")
    void parseToken_wrongKey_throwsJwtException() {
        // 다른 키로 서명된 토큰 생성
        SecretKey otherKey = Keys.hmacShaKeyFor(
                HexFormat.of().parseHex("abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789"));
        String forgedToken = io.jsonwebtoken.Jwts.builder()
                .subject("hacker")
                .claim("role", "member")
                .signWith(otherKey)
                .compact();

        assertThatThrownBy(() -> jwtProvider.parseToken(forgedToken))
                .isInstanceOf(JwtException.class);
    }

    @Test
    @DisplayName("parseToken: 만료된 토큰이면 JwtException")
    void parseToken_expired_throwsJwtException() {
        // TTL=0으로 즉시 만료 토큰 생성
        JwtProperties props = mock(JwtProperties.class);
        when(props.getSecret()).thenReturn(TEST_SECRET);
        when(props.getAccessTtl()).thenReturn(0L);
        when(props.getGuestTtl()).thenReturn(0L);
        when(props.getStateTtl()).thenReturn(0L);
        when(props.getRefreshTtl()).thenReturn(0L);

        JwtProvider expiredProvider = new JwtProvider(props);
        expiredProvider.initKey();

        String token = expiredProvider.generateAccessToken("user-1");

        assertThatThrownBy(() -> jwtProvider.parseToken(token))
                .isInstanceOf(JwtException.class);
    }
}
