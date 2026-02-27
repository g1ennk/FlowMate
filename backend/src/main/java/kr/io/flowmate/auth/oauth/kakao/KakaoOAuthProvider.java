package kr.io.flowmate.auth.oauth.kakao;

import kr.io.flowmate.auth.oauth.OAuthProvider;
import kr.io.flowmate.auth.oauth.OAuthUserInfo;
import lombok.RequiredArgsConstructor;
import org.springframework.http.*;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriComponentsBuilder;

import java.util.Map;
import java.util.Objects;

@Component
@RequiredArgsConstructor
public class KakaoOAuthProvider implements OAuthProvider {

    private final KakaoProperties props;
    private final RestTemplate restTemplate;

    @Override
    public String getProviderName() {
        return "kakao";
    }

    @Override
    public String generateAuthorizeUrl(String stateToken) {
        return UriComponentsBuilder.fromUriString(props.getAuthorizeUrl())
                .queryParam("client_id", props.getClientId())
                .queryParam("redirect_uri", props.getRedirectUri())
                .queryParam("response_type", "code")
                .queryParam("state", stateToken)
                .toUriString();
    }

    @Override
    public String exchangeCodeForToken(String code) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);

        MultiValueMap<String, String> body = new LinkedMultiValueMap<>();
        body.add("grant_type", "authorization_code");
        body.add("client_id", props.getClientId());
        body.add("client_secret", props.getClientSecret());
        body.add("redirect_uri", props.getRedirectUri());
        body.add("code", code);

        try {
            ResponseEntity<Map> response = restTemplate.postForEntity(
                    props.getTokenUrl(), new HttpEntity<>(body, headers), Map.class);

            if (response.getBody() == null || !response.getBody().containsKey("access_token")) {
                throw new RuntimeException("카카오 토큰 발급 실패");
            }
            return (String) response.getBody().get("access_token");
        } catch (HttpClientErrorException e) {
            throw new IllegalArgumentException("카카오 인가코드가 유효하지 않습니다: " + e.getStatusCode());
        }
    }

    @Override
    @SuppressWarnings("unchecked")
    public OAuthUserInfo getUserInfo(String accessToken) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(accessToken);

        ResponseEntity<Map> response = restTemplate.exchange(
                props.getUserInfoUrl(), HttpMethod.GET, new HttpEntity<>(headers), Map.class);

        Map<String, Object> body = Objects.requireNonNull(response.getBody(), "카카오 사용자 정보 응답이 비어있습니다.");
        String providerId = String.valueOf(
                Objects.requireNonNull(body.get("id"), "카카오 응답에 id가 없습니다."));

        Map<String, Object> kakaoAccount = (Map<String, Object>) body.get("kakao_account");
        if (kakaoAccount == null) {
            throw new IllegalStateException("카카오 응답에 kakao_account가 없습니다. 필수 동의항목을 확인하세요.");
        }

        Map<String, Object> profile = (Map<String, Object>) kakaoAccount.get("profile");
        if (profile == null) {
            throw new IllegalStateException("카카오 응답에 profile이 없습니다. 필수 동의항목을 확인하세요.");
        }

        String nickname = (String) profile.get("nickname");
        String email = kakaoAccount.containsKey("email")
                ? (String) kakaoAccount.get("email") : null;

        return new OAuthUserInfo(providerId, email, nickname);
    }
}