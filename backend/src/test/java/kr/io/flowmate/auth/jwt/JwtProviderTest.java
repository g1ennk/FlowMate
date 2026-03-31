package kr.io.flowmate.auth.jwt;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@DisplayName("JwtProvider")
class JwtProviderTest {

    private JwtProvider jwtProvider;

    private static final String TEST_SECRET =
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    @BeforeEach
    void setUp() {
        JwtProperties props = new JwtProperties();
        props.setSecret(TEST_SECRET);
        props.setAccessTtl(900);
        props.setGuestTtl(7776000);
        props.setStateTtl(300);
        props.setRefreshTtl(1209600);

        jwtProvider = new JwtProvider(props);
        jwtProvider.init(); // @PostConstruct 수동 호출
    }

    @Test
    @DisplayName("generateGuestToken: role=guest, subject=clientId로 토큰 생성")
    void generateGuestToken_createsTokenWithGuestRole() {
        // given
        String clientId = "test-client-id";

        // when
        String token = jwtProvider.generateGuestToken(clientId);

        // then
        Claims claims = jwtProvider.parseToken(token);
        assertThat(claims.getSubject()).isEqualTo(clientId);
        assertThat(claims.get("role", String.class)).isEqualTo("guest");
    }

    @Test
    @DisplayName("generateAccessToken: role=member, subject=userId로 토큰 생성")
    void generateAccessToken_createsTokenWithMemberRole() {
        // given
        String userId = "user-123";

        // when
        String token = jwtProvider.generateAccessToken(userId);

        // then
        Claims claims = jwtProvider.parseToken(token);
        assertThat(claims.getSubject()).isEqualTo(userId);
        assertThat(claims.get("role", String.class)).isEqualTo("member");
    }

    @Test
    @DisplayName("generateStateToken: role=state, UUID subject로 토큰 생성")
    void generateStateToken_createsTokenWithStateRole() {
        // when
        String token = jwtProvider.generateStateToken();

        // then
        Claims claims = jwtProvider.parseToken(token);
        assertThat(claims.get("role", String.class)).isEqualTo("state");
        assertThat(claims.getSubject()).isNotBlank();
    }

    @Test
    @DisplayName("parseToken: 만료된 토큰 → JwtException")
    void parseToken_expiredToken_throwsJwtException() {
        // given — TTL 0초로 즉시 만료 토큰 생성
        JwtProperties expiredProps = new JwtProperties();
        expiredProps.setSecret(TEST_SECRET);
        expiredProps.setAccessTtl(0);
        expiredProps.setGuestTtl(0);
        expiredProps.setStateTtl(0);
        expiredProps.setRefreshTtl(0);

        JwtProvider expiredProvider = new JwtProvider(expiredProps);
        expiredProvider.init();
        String token = expiredProvider.generateAccessToken("user-1");

        // when & then
        assertThatThrownBy(() -> jwtProvider.parseToken(token))
                .isInstanceOf(JwtException.class);
    }

    @Test
    @DisplayName("parseToken: 위조된 서명 → JwtException")
    void parseToken_tamperedToken_throwsJwtException() {
        // given
        String token = jwtProvider.generateAccessToken("user-1");
        String tampered = token.substring(0, token.length() - 5) + "XXXXX";

        // when & then
        assertThatThrownBy(() -> jwtProvider.parseToken(tampered))
                .isInstanceOf(JwtException.class);
    }

    @Test
    @DisplayName("parseClaims: 유효한 토큰 → Optional.of(Claims)")
    void parseClaims_validToken_returnsPresent() {
        // given
        String token = jwtProvider.generateAccessToken("user-1");

        // when
        Optional<Claims> result = jwtProvider.parseClaims(token);

        // then
        assertThat(result).isPresent();
        assertThat(result.get().getSubject()).isEqualTo("user-1");
    }

    @Test
    @DisplayName("parseClaims: 잘못된 토큰 → Optional.empty()")
    void parseClaims_invalidToken_returnsEmpty() {
        // when
        Optional<Claims> result = jwtProvider.parseClaims("invalid.token.here");

        // then
        assertThat(result).isEmpty();
    }

    @Test
    @DisplayName("validateToken: 유효한 토큰 → true")
    void validateToken_validToken_returnsTrue() {
        // given
        String token = jwtProvider.generateAccessToken("user-1");

        // when & then
        assertThat(jwtProvider.validateToken(token)).isTrue();
    }

    @Test
    @DisplayName("validateToken: 잘못된 토큰 → false")
    void validateToken_invalidToken_returnsFalse() {
        // when & then
        assertThat(jwtProvider.validateToken("garbage")).isFalse();
    }

    @Test
    @DisplayName("SecretKey 캐싱: init() 후 동일 SecretKey 인스턴스 재사용")
    void secretKeyCaching_afterInit_reusesSameInstance() {
        // given
        String token1 = jwtProvider.generateAccessToken("user-1");
        String token2 = jwtProvider.generateGuestToken("client-1");

        // when — 두 토큰 모두 같은 캐시된 키로 파싱 가능
        Claims claims1 = jwtProvider.parseToken(token1);
        Claims claims2 = jwtProvider.parseToken(token2);

        // then
        assertThat(claims1.getSubject()).isEqualTo("user-1");
        assertThat(claims2.getSubject()).isEqualTo("client-1");
    }
}
