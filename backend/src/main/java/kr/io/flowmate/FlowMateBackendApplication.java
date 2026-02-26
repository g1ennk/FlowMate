package kr.io.flowmate;

import kr.io.flowmate.auth.jwt.JwtProperties;
import kr.io.flowmate.auth.oauth.kakao.KakaoProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

@SpringBootApplication
@EnableConfigurationProperties({JwtProperties.class, KakaoProperties.class})
public class FlowMateBackendApplication {

    public static void main(String[] args) {
        SpringApplication.run(FlowMateBackendApplication.class, args);
    }

}
