package kr.io.flowmate.config;

import io.jsonwebtoken.Claims;
import kr.io.flowmate.auth.jwt.JwtProvider;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;

import jakarta.servlet.FilterChain;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;
import static org.mockito.Mockito.lenient;

@ExtendWith(MockitoExtension.class)
@DisplayName("JwtAuthFilter")
class JwtAuthFilterTest {

    @Mock
    private JwtProvider jwtProvider;

    @Mock
    private FilterChain filterChain;

    @InjectMocks
    private JwtAuthFilter jwtAuthFilter;

    private MockHttpServletRequest request;
    private MockHttpServletResponse response;

    @BeforeEach
    void setUp() {
        request = new MockHttpServletRequest();
        response = new MockHttpServletResponse();
        SecurityContextHolder.clearContext();
    }

    private Claims buildClaims(String subject, String role) {
        Claims claims = mock(Claims.class);
        lenient().when(claims.getSubject()).thenReturn(subject);
        lenient().when(claims.get("role", String.class)).thenReturn(role);
        return claims;
    }

    @Test
    @DisplayName("유효한 member 토큰 → ROLE_MEMBER 권한으로 SecurityContext 설정")
    void validMemberToken_setsSecurityContextWithMemberRole() throws Exception {
        // given
        Claims claims = buildClaims("user-123", "member");
        request.addHeader("Authorization", "Bearer valid-token");
        when(jwtProvider.parseClaims("valid-token")).thenReturn(Optional.of(claims));

        // when
        jwtAuthFilter.doFilterInternal(request, response, filterChain);

        // then
        var auth = SecurityContextHolder.getContext().getAuthentication();
        assertThat(auth).isNotNull();
        assertThat(auth.getPrincipal()).isEqualTo("user-123");
        assertThat(auth.getAuthorities()).anyMatch(a -> a.getAuthority().equals("ROLE_MEMBER"));
        verify(filterChain).doFilter(request, response);
    }

    @Test
    @DisplayName("유효한 guest 토큰 → ROLE_GUEST 권한으로 SecurityContext 설정")
    void validGuestToken_setsSecurityContextWithGuestRole() throws Exception {
        // given
        Claims claims = buildClaims("client-456", "guest");
        request.addHeader("Authorization", "Bearer guest-token");
        when(jwtProvider.parseClaims("guest-token")).thenReturn(Optional.of(claims));

        // when
        jwtAuthFilter.doFilterInternal(request, response, filterChain);

        // then
        var auth = SecurityContextHolder.getContext().getAuthentication();
        assertThat(auth).isNotNull();
        assertThat(auth.getPrincipal()).isEqualTo("client-456");
        assertThat(auth.getAuthorities()).anyMatch(a -> a.getAuthority().equals("ROLE_GUEST"));
    }

    @Test
    @DisplayName("state 토큰 → SecurityContext 설정하지 않음 (CSRF 방어용 토큰)")
    void stateToken_doesNotSetSecurityContext() throws Exception {
        // given
        Claims claims = buildClaims("random-uuid", "state");
        request.addHeader("Authorization", "Bearer state-token");
        when(jwtProvider.parseClaims("state-token")).thenReturn(Optional.of(claims));

        // when
        jwtAuthFilter.doFilterInternal(request, response, filterChain);

        // then
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
        verify(filterChain).doFilter(request, response);
    }

    @Test
    @DisplayName("만료/잘못된 토큰 → SecurityContext 비어있음, 필터 체인 계속 진행")
    void invalidToken_emptySecurityContext_continuesChain() throws Exception {
        // given
        request.addHeader("Authorization", "Bearer expired-token");
        when(jwtProvider.parseClaims("expired-token")).thenReturn(Optional.empty());

        // when
        jwtAuthFilter.doFilterInternal(request, response, filterChain);

        // then
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
        verify(filterChain).doFilter(request, response);
    }

    @Test
    @DisplayName("Authorization 헤더 없음 → SecurityContext 비어있음")
    void noAuthHeader_emptySecurityContext() throws Exception {
        // when
        jwtAuthFilter.doFilterInternal(request, response, filterChain);

        // then
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
        verify(filterChain).doFilter(request, response);
        verifyNoInteractions(jwtProvider);
    }

    @Test
    @DisplayName("단일 파싱: parseClaims 한 번만 호출됨")
    void singleParse_parseClaimsCalledOnce() throws Exception {
        // given
        Claims claims = buildClaims("user-1", "member");
        request.addHeader("Authorization", "Bearer token");
        when(jwtProvider.parseClaims("token")).thenReturn(Optional.of(claims));

        // when
        jwtAuthFilter.doFilterInternal(request, response, filterChain);

        // then
        verify(jwtProvider, times(1)).parseClaims("token");
        verifyNoMoreInteractions(jwtProvider);
    }
}
