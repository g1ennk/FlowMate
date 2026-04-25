package kr.io.flowmate.auth.controller;

import jakarta.servlet.http.Cookie;
import kr.io.flowmate.auth.dto.response.AuthorizeUrlResponse;
import kr.io.flowmate.auth.dto.response.GuestTokenResponse;
import kr.io.flowmate.auth.dto.response.LoginResponse;
import kr.io.flowmate.auth.dto.response.UserResponse;
import kr.io.flowmate.auth.service.AuthService;
import kr.io.flowmate.common.web.GlobalExceptionHandler;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
@DisplayName("AuthController")
class AuthControllerTest {

    private static final String PROVIDER = "kakao";
    private static final String GUEST_TOKEN = "guest.jwt.token";
    private static final String ACCESS_TOKEN = "member.access.token";
    private static final String REFRESH_TOKEN = "raw-refresh-token";
    private static final UserResponse USER = new UserResponse(
            "c6d4ed5b-9d1e-4ecd-ac4f-9c1490f6fd01", "user@example.com", "닉네임");

    @Mock private AuthService authService;

    @InjectMocks private AuthController authController;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(authController)
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    @DisplayName("POST /api/auth/guest/token: 200 + guestToken JSON")
    void guestToken_returns200() throws Exception {
        when(authService.issueGuestToken()).thenReturn(new GuestTokenResponse(GUEST_TOKEN));

        mockMvc.perform(post("/api/auth/guest/token"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.guestToken").value(GUEST_TOKEN));
    }

    @Test
    @DisplayName("GET /api/auth/{provider}/authorize-url: 200 + authorizeUrl + state JSON")
    void authorizeUrl_returns200() throws Exception {
        when(authService.getAuthorizeUrl(eq(PROVIDER)))
                .thenReturn(new AuthorizeUrlResponse("https://kauth.kakao.com/oauth/authorize?...", "state-jwt"));

        mockMvc.perform(get("/api/auth/{provider}/authorize-url", PROVIDER))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.authorizeUrl").exists())
                .andExpect(jsonPath("$.state").value("state-jwt"));
    }

    @Test
    @DisplayName("POST /api/auth/{provider}/exchange: 정상 body는 200 + accessToken + user JSON")
    void exchange_returns200_whenValid() throws Exception {
        when(authService.login(eq(PROVIDER), eq("auth-code"), eq("state-jwt"), any()))
                .thenReturn(new LoginResponse(ACCESS_TOKEN, USER));

        String body = """
                {"code": "auth-code", "state": "state-jwt"}
                """;

        mockMvc.perform(post("/api/auth/{provider}/exchange", PROVIDER)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").value(ACCESS_TOKEN))
                .andExpect(jsonPath("$.user.id").value(USER.id()))
                .andExpect(jsonPath("$.user.email").value(USER.email()));
    }

    @Test
    @DisplayName("POST /api/auth/{provider}/exchange: code 누락 시 400 VALIDATION_ERROR")
    void exchange_returns400_whenCodeBlank() throws Exception {
        String body = """
                {"code": "", "state": "state-jwt"}
                """;

        mockMvc.perform(post("/api/auth/{provider}/exchange", PROVIDER)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));

        verifyNoInteractions(authService);
    }

    @Test
    @DisplayName("POST /api/auth/{provider}/exchange: state 누락 시 400 VALIDATION_ERROR")
    void exchange_returns400_whenStateBlank() throws Exception {
        String body = """
                {"code": "auth-code", "state": ""}
                """;

        mockMvc.perform(post("/api/auth/{provider}/exchange", PROVIDER)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));

        verifyNoInteractions(authService);
    }

    @Test
    @DisplayName("POST /api/auth/refresh: refreshToken 쿠키 보유 시 200 + accessToken JSON")
    void refresh_returns200_whenCookiePresent() throws Exception {
        when(authService.refresh(eq(REFRESH_TOKEN), any()))
                .thenReturn(new LoginResponse(ACCESS_TOKEN, USER));

        mockMvc.perform(post("/api/auth/refresh")
                        .cookie(new Cookie("refreshToken", REFRESH_TOKEN)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").value(ACCESS_TOKEN));
    }

    @Test
    @DisplayName("POST /api/auth/refresh: refreshToken 쿠키 부재 시 401, AuthService 미호출")
    void refresh_returns401_whenCookieMissing() throws Exception {
        mockMvc.perform(post("/api/auth/refresh"))
                .andExpect(status().isUnauthorized());

        verifyNoInteractions(authService);
    }

    @Test
    @DisplayName("POST /api/auth/logout: 204 No Content + AuthService.logout 위임")
    void logout_returns204_andDelegates() throws Exception {
        mockMvc.perform(post("/api/auth/logout")
                        .cookie(new Cookie("refreshToken", REFRESH_TOKEN)))
                .andExpect(status().isNoContent());

        verify(authService).logout(eq(REFRESH_TOKEN), any());
    }
}
