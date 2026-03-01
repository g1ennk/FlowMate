package kr.io.flowmate.auth.controller;

import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import kr.io.flowmate.auth.dto.*;
import kr.io.flowmate.auth.service.AuthService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    /**
     * 게스트 JWT 발급
     */
    @PostMapping("/guest/token")
    public ResponseEntity<GuestTokenResponse> guestToken() {
        return ResponseEntity.ok(authService.issueGuestToken());
    }

    /**
     * 소셜 로그인 URL 발급
     */
    @GetMapping("/{provider}/authorize-url")
    public ResponseEntity<AuthorizeUrlResponse> authorizeUrl(@PathVariable String provider) {
        return ResponseEntity.ok(authService.getAuthorizeUrl(provider));
    }

    /**
     * 소셜 인가코드 교환
     */
    @PostMapping("/{provider}/exchange")
    public ResponseEntity<LoginResponse> exchange(
            @PathVariable String provider,
            @Valid @RequestBody ExchangeRequest request,
            HttpServletResponse response) {
        return ResponseEntity.ok(
                authService.login(provider, request.code(), request.state(), response)
        );
    }

    /**
     * Access Token 재발급
     */
    @PostMapping("/refresh")
    public ResponseEntity<LoginResponse> refresh(
            @CookieValue(name = "refreshToken", required = false) String rawRefreshToken,
            HttpServletResponse response
    ) {
        if (rawRefreshToken == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        return ResponseEntity.ok(authService.refresh(rawRefreshToken, response));
    }

    /**
     * 로그아웃
     */
    @PostMapping("/logout")
    public ResponseEntity<Void> logout(
            @CookieValue(name = "refreshToken", required = false) String refreshToken,
            HttpServletResponse response
    ) {
        authService.logout(refreshToken, response);
        return ResponseEntity.noContent().build();
    }

    /**
     * 내 정보 (MEMBER 전용 - SecurityConfig에서 role 제한)
     */
    @GetMapping("/me")
    public ResponseEntity<UserResponse> me(Authentication authentication) {
        String userId = (String) authentication.getPrincipal();
        return ResponseEntity.ok(authService.me(userId));
    }
}
