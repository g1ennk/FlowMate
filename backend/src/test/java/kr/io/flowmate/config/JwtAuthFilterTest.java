package kr.io.flowmate.config;

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
@DisplayName("JwtAuthFilterTest")
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
    @DisplayName("doFilter: 유효한 멤버 토큰이면 ROLE_MEMBER + userId principal 로 SecurityContext 설정")
    void doFilter_validMemberToken_setsMemberAuthentication() throws Exception {
        stubToken("token-member", "user-42", "member");

        filter.doFilter(requestWithBearer("token-member"), new MockHttpServletResponse(), new MockFilterChain());

        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        assertThat(auth).isNotNull();
        assertThat(auth.getPrincipal()).isEqualTo("user-42");
        assertThat(auth.getAuthorities()).extracting("authority").containsExactly("ROLE_MEMBER");
    }

    @Test
    @DisplayName("doFilter: state 토큰은 OAuth CSRF 용이라 API 인증으로 사용하지 않음")
    void doFilter_stateToken_doesNotAuthenticate() throws Exception {
        stubToken("token-state", "uuid-1", "state");

        filter.doFilter(requestWithBearer("token-state"), new MockHttpServletResponse(), new MockFilterChain());

        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
    }

    @Test
    @DisplayName("doFilter: Authorization 헤더가 없으면 SecurityContext 를 건드리지 않음")
    void doFilter_noHeader_skipsAuthentication() throws Exception {
        filter.doFilter(new MockHttpServletRequest(), new MockHttpServletResponse(), new MockFilterChain());

        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
    }

    @Test
    @DisplayName("doFilter: Authorization 헤더는 있으나 Bearer prefix 가 아니면 무시")
    void doFilter_nonBearerHeader_skipsAuthentication() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("Authorization", "Basic abc");

        filter.doFilter(request, new MockHttpServletResponse(), new MockFilterChain());

        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
    }

    @Test
    @DisplayName("doFilter: 검증 실패한 토큰은 SecurityContext 를 건드리지 않음")
    void doFilter_invalidToken_skipsAuthentication() throws Exception {
        when(jwtProvider.validateToken("bad")).thenReturn(false);

        filter.doFilter(requestWithBearer("bad"), new MockHttpServletResponse(), new MockFilterChain());

        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
    }

    private MockHttpServletRequest requestWithBearer(String token) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("Authorization", "Bearer " + token);
        return request;
    }

    private void stubToken(String token, String subject, String role) {
        when(jwtProvider.validateToken(token)).thenReturn(true);
        when(jwtProvider.extractSubject(token)).thenReturn(subject);
        when(jwtProvider.extractRole(token)).thenReturn(role);
    }
}
