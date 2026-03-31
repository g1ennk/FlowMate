package kr.io.flowmate.common.web;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@DisplayName("CurrentUserResolver")
class CurrentUserResolverTest {

    private CurrentUserResolver resolver;

    @BeforeEach
    void setUp() {
        resolver = new CurrentUserResolver();
        SecurityContextHolder.clearContext();
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    @DisplayName("resolve: 인증된 회원 → userId 반환")
    void resolve_authenticatedMember_returnsUserId() {
        // given
        var auth = new UsernamePasswordAuthenticationToken(
                "user-123", null,
                List.of(new SimpleGrantedAuthority("ROLE_MEMBER"))
        );
        SecurityContextHolder.getContext().setAuthentication(auth);

        // when
        String userId = resolver.resolve();

        // then
        assertThat(userId).isEqualTo("user-123");
    }

    @Test
    @DisplayName("resolve: 인증된 게스트 → clientId 반환")
    void resolve_authenticatedGuest_returnsClientId() {
        // given
        var auth = new UsernamePasswordAuthenticationToken(
                "guest-client-id", null,
                List.of(new SimpleGrantedAuthority("ROLE_GUEST"))
        );
        SecurityContextHolder.getContext().setAuthentication(auth);

        // when
        String clientId = resolver.resolve();

        // then
        assertThat(clientId).isEqualTo("guest-client-id");
    }

    @Test
    @DisplayName("resolve: SecurityContext가 비어있음 → IllegalStateException")
    void resolve_emptyContext_throwsException() {
        // when & then
        assertThatThrownBy(() -> resolver.resolve())
                .isInstanceOf(kr.io.flowmate.auth.exception.AuthenticationFailedException.class)
                .hasMessageContaining("인증 정보가 없습니다");
    }

    @Test
    @DisplayName("resolve: AnonymousAuthenticationToken → IllegalStateException")
    void resolve_anonymousToken_throwsException() {
        // given
        var anonymous = new AnonymousAuthenticationToken(
                "key", "anonymousUser",
                List.of(new SimpleGrantedAuthority("ROLE_ANONYMOUS"))
        );
        SecurityContextHolder.getContext().setAuthentication(anonymous);

        // when & then
        assertThatThrownBy(() -> resolver.resolve())
                .isInstanceOf(kr.io.flowmate.auth.exception.AuthenticationFailedException.class)
                .hasMessageContaining("인증 정보가 없습니다");
    }
}
