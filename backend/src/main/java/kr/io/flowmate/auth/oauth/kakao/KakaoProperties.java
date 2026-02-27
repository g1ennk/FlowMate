package kr.io.flowmate.auth.oauth.kakao;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "kakao")
@Getter
@Setter
public class KakaoProperties {
    private String clientId;
    private String clientSecret;
    private String redirectUri;
    private String authorizeUrl;
    private String tokenUrl;
    private String userInfoUrl;
}
