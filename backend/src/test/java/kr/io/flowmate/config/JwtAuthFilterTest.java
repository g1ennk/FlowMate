package kr.io.flowmate.config;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import kr.io.flowmate.auth.jwt.JwtProvider;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@DisplayName("JwtAuthFilter")
class JwtAuthFilterTest {

    @Mock
    private JwtProvider jwtProvider;

    @InjectMocks
    private JwtAuthFilter filter;

    @BeforeEach
    @AfterEach
    void clearContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    @DisplayName("doFilter: 유효한 멤버 토큰이면 ROLE_MEMBER + userId principal")
    void doFilter_validMemberToken_setsMemberAuthentication() throws Exception {
        when(jwtProvider.parseToken("token-member"))
                .thenReturn(claims("user-42", "member"));

        filter.doFilter(requestWithBearer("token-member"),
                new MockHttpServletResponse(), new MockFilterChain());

        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        assertThat(auth).isNotNull();
        assertThat(auth.getPrincipal()).isEqualTo("user-42");
        assertThat(auth.getAuthorities()).extracting("authority")
                .containsExactly("ROLE_MEMBER");
    }

    @Test
    @DisplayName("doFilter: 유효한 게스트 토큰이면 ROLE_GUEST + clientId principal")
    void doFilter_validGuestToken_setsGuestAuthentication() throws Exception {
        when(jwtProvider.parseToken("token-guest"))
                .thenReturn(claims("client-abc", "guest"));

        filter.doFilter(requestWithBearer("token-guest"),
                new MockHttpServletResponse(), new MockFilterChain());

        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        assertThat(auth).isNotNull();
        assertThat(auth.getPrincipal()).isEqualTo("client-abc");
        assertThat(auth.getAuthorities()).extracting("authority")
                .containsExactly("ROLE_GUEST");
    }

    @Test
    @DisplayName("doFilter: state 토큰은 OAuth CSRF 용이라 API 인증으로 사용하지 않음")
    void doFilter_stateToken_doesNotAuthenticate() throws Exception {
        when(jwtProvider.parseToken("token-state"))
                .thenReturn(claims("uuid-1", "state"));

        filter.doFilter(requestWithBearer("token-state"),
                new MockHttpServletResponse(), new MockFilterChain());

        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
    }

    @Test
    @DisplayName("doFilter: Authorization 헤더가 없으면 SecurityContext 를 건드리지 않음")
    void doFilter_noHeader_skipsAuthentication() throws Exception {
        filter.doFilter(new MockHttpServletRequest(),
                new MockHttpServletResponse(), new MockFilterChain());

        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
    }

    @Test
    @DisplayName("doFilter: 파싱 실패(서명 오류/만료)하면 인증 없이 통과")
    void doFilter_parseThrows_skipsAuthentication() throws Exception {
        when(jwtProvider.parseToken("bad")).thenThrow(new JwtException("invalid"));

        filter.doFilter(requestWithBearer("bad"),
                new MockHttpServletResponse(), new MockFilterChain());

        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
    }

    private MockHttpServletRequest requestWithBearer(String token) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("Authorization", "Bearer " + token);
        return request;
    }

    private Claims claims(String subject, String role) {
        return Jwts.claims()
                .subject(subject)
                .add("role", role)
                .build();
    }
}
