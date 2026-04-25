package kr.io.flowmate.common.util;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@DisplayName("CurrentUserResolverTest")
class CurrentUserResolverTest {

    private final CurrentUserResolver resolver = new CurrentUserResolver();

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    @DisplayName("resolve: 인증된 상태면 SecurityContext 의 principal 을 반환")
    void resolve_authenticated_returnsPrincipal() {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(
                        "user-123", null, List.of(new SimpleGrantedAuthority("ROLE_MEMBER"))
                )
        );

        assertThat(resolver.resolve()).isEqualTo("user-123");
    }

    @Test
    @DisplayName("resolve: 인증 정보가 없으면 IllegalStateException")
    void resolve_noAuthentication_throwsIllegalState() {
        SecurityContextHolder.clearContext();

        assertThatThrownBy(resolver::resolve)
                .isInstanceOf(IllegalStateException.class);
    }
}
