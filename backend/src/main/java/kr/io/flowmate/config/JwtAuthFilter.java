package kr.io.flowmate.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import kr.io.flowmate.auth.jwt.JwtProvider;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

// Bearer 토큰을 검증해 SecurityContext 에 인증 주체를 채우는 필터
@Component
@RequiredArgsConstructor
public class JwtAuthFilter extends OncePerRequestFilter {

    private static final String BEARER_PREFIX = "Bearer ";
    private static final String ROLE_GUEST = "guest";
    private static final String ROLE_MEMBER = "member";

    // 매 요청마다 새로 만들지 않도록 역할별 권한 리스트를 불변 싱글턴으로 캐싱
    private static final List<GrantedAuthority> GUEST_AUTHORITIES =
            List.of(new SimpleGrantedAuthority("ROLE_GUEST"));
    private static final List<GrantedAuthority> MEMBER_AUTHORITIES =
            List.of(new SimpleGrantedAuthority("ROLE_MEMBER"));

    private final JwtProvider jwtProvider;

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {

        String token = extractToken(request);

        if (token != null) {
            try {
                Claims claims = jwtProvider.parseToken(token);
                String role = claims.get("role", String.class);

                // state JWT 는 OAuth CSRF 방어용이라 API 인증 수단으로 사용하지 않는다
                List<GrantedAuthority> authorities = resolveAuthorities(role);
                if (authorities != null) {
                    // principal = subject (게스트면 clientId, 멤버면 userId)
                    UsernamePasswordAuthenticationToken auth =
                            new UsernamePasswordAuthenticationToken(claims.getSubject(), null, authorities);
                    auth.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                    SecurityContextHolder.getContext().setAuthentication(auth);
                }
            } catch (JwtException | IllegalArgumentException ignored) {
                // 유효하지 않은 토큰 — 인증 없이 통과 (permitAll 엔드포인트에서 처리)
            }
        }

        filterChain.doFilter(request, response);
    }

    private static List<GrantedAuthority> resolveAuthorities(String role) {
        if (ROLE_MEMBER.equals(role)) {
            return MEMBER_AUTHORITIES;
        }
        if (ROLE_GUEST.equals(role)) {
            return GUEST_AUTHORITIES;
        }
        return null;
    }

    private String extractToken(HttpServletRequest request) {
        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith(BEARER_PREFIX)) {
            return header.substring(BEARER_PREFIX.length());
        }
        return null;
    }
}
