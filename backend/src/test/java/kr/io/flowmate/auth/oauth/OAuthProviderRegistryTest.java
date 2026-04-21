package kr.io.flowmate.auth.oauth;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@DisplayName("OAuthProviderRegistry")
class OAuthProviderRegistryTest {

    @Test
    @DisplayName("get: 등록된 provider 반환")
    void get_registeredProvider_returnsProvider() {
        OAuthProvider stub = stubProvider("kakao");
        OAuthProviderRegistry registry = new OAuthProviderRegistry(List.of(stub));

        assertThat(registry.get("kakao")).isSameAs(stub);
    }

    @Test
    @DisplayName("get: 미등록 provider 요청 시 IAE")
    void get_unknownProvider_throwsIAE() {
        OAuthProviderRegistry registry = new OAuthProviderRegistry(List.of(stubProvider("kakao")));

        assertThatThrownBy(() -> registry.get("google"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("google");
    }

    private OAuthProvider stubProvider(String name) {
        return new OAuthProvider() {
            @Override public String getProviderName() { return name; }
            @Override public String generateAuthorizeUrl(String stateToken) { return ""; }
            @Override public String exchangeCodeForToken(String code) { return ""; }
            @Override public OAuthUserInfo getUserInfo(String accessToken) { return null; }
        };
    }
}
