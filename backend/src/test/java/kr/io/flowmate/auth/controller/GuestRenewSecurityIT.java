package kr.io.flowmate.auth.controller;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import kr.io.flowmate.auth.jwt.JwtProperties;
import kr.io.flowmate.auth.jwt.JwtProvider;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import java.time.Instant;
import java.util.Date;
import java.util.HexFormat;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 게스트 토큰 재발급은 만료된 토큰을 들고 오는 요청이라 인증 없이 통과해야 한다.
 * 보안 필터 체인까지 포함해 permitAll 설정과 만료 토큰 재발급을 함께 확인한다.
 */
@SpringBootTest
@ActiveProfiles("test")
@DisplayName("POST /api/auth/guest/renew (보안 필터 포함)")
class GuestRenewSecurityIT {

    @Autowired private WebApplicationContext context;
    @Autowired private JwtProperties jwtProperties;
    @Autowired private JwtProvider jwtProvider;

    @MockitoBean
    private RedisMessageListenerContainer redisMessageListenerContainer;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
    }

    @Test
    @DisplayName("만료된 게스트 토큰을 같은 clientId의 새 토큰으로 바꿔 준다")
    void renewsExpiredGuestTokenWithoutAuthentication() throws Exception {
        String expired = guestToken("client-renew", Instant.now().minusSeconds(3600));

        MvcResult result = mockMvc.perform(post("/api/auth/guest/renew")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"guestToken\":\"" + expired + "\"}"))
                .andExpect(status().isOk())
                .andReturn();

        String renewed = result.getResponse().getContentAsString()
                .replaceAll(".*\"guestToken\"\\s*:\\s*\"([^\"]+)\".*", "$1");
        assertThat(jwtProvider.parseToken(renewed).getSubject()).isEqualTo("client-renew");
    }

    @Test
    @DisplayName("다른 키로 서명된 토큰은 401")
    void rejectsForgedToken() throws Exception {
        String forged = Jwts.builder()
                .subject("client-forged")
                .claim("role", "guest")
                .expiration(Date.from(Instant.now().plusSeconds(3600)))
                .signWith(Keys.hmacShaKeyFor(HexFormat.of().parseHex(
                        "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789")))
                .compact();

        mockMvc.perform(post("/api/auth/guest/renew")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"guestToken\":\"" + forged + "\"}"))
                .andExpect(status().isUnauthorized());
    }

    private String guestToken(String clientId, Instant expiresAt) {
        return Jwts.builder()
                .subject(clientId)
                .claim("role", "guest")
                .issuedAt(Date.from(expiresAt.minusSeconds(jwtProperties.getGuestTtl())))
                .expiration(Date.from(expiresAt))
                .signWith(Keys.hmacShaKeyFor(HexFormat.of().parseHex(jwtProperties.getSecret())))
                .compact();
    }
}
