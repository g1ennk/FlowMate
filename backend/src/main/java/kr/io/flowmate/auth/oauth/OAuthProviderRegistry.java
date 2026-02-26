package kr.io.flowmate.auth.oauth;

import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Component
public class OAuthProviderRegistry {
    /**
     * Spring이 OAuthProvider 구현체를 List로 자동 주입한다.
     * getProviderName() 반환값을 key로 Map을 구성한다.
     * <p>
     * 따라서 새 Provider 추가 시:
     * 1. OAuthProvider를 구현하는 @Component 클래스 생성
     * 2. getProviderName()에서 Provider 식별자 반환
     * 3. 자동으로 Registry에 등록되어 코드를 수정할 필요 없음
     */

    private final Map<String, OAuthProvider> providers;

    public OAuthProviderRegistry(List<OAuthProvider> providerList) {
        this.providers = providerList.stream()
                .collect(Collectors.toMap(OAuthProvider::getProviderName, p -> p));
    }

    public OAuthProvider get(String providerName) {
        OAuthProvider provider = providers.get(providerName);
        if (provider == null) {
            throw new IllegalArgumentException("지원하지 않는 provider: " + providerName);
        }
        return provider;
    }
}
