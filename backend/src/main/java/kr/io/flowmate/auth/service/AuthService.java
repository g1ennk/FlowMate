package kr.io.flowmate.auth.service;

import jakarta.servlet.http.HttpServletResponse;
import kr.io.flowmate.auth.domain.RefreshToken;
import kr.io.flowmate.auth.domain.SocialAccount;
import kr.io.flowmate.auth.domain.User;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import kr.io.flowmate.auth.dto.response.AuthorizeUrlResponse;
import kr.io.flowmate.auth.dto.response.GuestTokenResponse;
import kr.io.flowmate.auth.dto.response.LoginResponse;
import kr.io.flowmate.auth.dto.response.UserResponse;
import kr.io.flowmate.auth.jwt.JwtProperties;
import kr.io.flowmate.auth.jwt.JwtProvider;
import kr.io.flowmate.auth.oauth.OAuthProvider;
import kr.io.flowmate.auth.oauth.OAuthProviderRegistry;
import kr.io.flowmate.auth.oauth.OAuthUserInfo;
import kr.io.flowmate.auth.repository.RefreshTokenRepository;
import kr.io.flowmate.auth.repository.SocialAccountRepository;
import kr.io.flowmate.auth.repository.UserRepository;
import kr.io.flowmate.common.exception.AuthenticationFailedException;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Optional;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class AuthService {

    @Value("${cookie.secure:false}")
    private boolean cookieSecure;

    private final JwtProvider jwtProvider;
    private final OAuthProviderRegistry oAuthProviderRegistry;
    private final UserRepository userRepository;
    private final SocialAccountRepository socialAccountRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final RefreshTokenRevoker refreshTokenRevoker;
    private final SocialAccountRegistrar socialAccountRegistrar;
    private final JwtProperties jwtProps;

    /**
     * 게스트 JWT 발급
     */
    public GuestTokenResponse issueGuestToken() {
        String clientId = UUID.randomUUID().toString();
        return new GuestTokenResponse(jwtProvider.generateGuestToken(clientId));
    }

    /**
     * 게스트 JWT 재발급 - 같은 clientId 로 새 토큰을 발급해 게스트 기록을 이어 쓴다.
     * 만료된 토큰도 서명이 유효하면 받아 주되, 만료 후 게스트 TTL 만큼 지난 토큰은 거부한다
     * (오래전에 유출된 토큰이 무기한 되살아나지 않도록).
     */
    public GuestTokenResponse renewGuestToken(String guestToken) {
        Claims claims;
        try {
            claims = jwtProvider.parseTokenAllowingExpired(guestToken);
        } catch (JwtException | IllegalArgumentException e) {
            throw new AuthenticationFailedException("유효하지 않은 게스트 토큰입니다.");
        }
        if (!"guest".equals(claims.get("role", String.class)) || claims.getExpiration() == null) {
            throw new AuthenticationFailedException("유효하지 않은 게스트 토큰입니다.");
        }
        Instant renewableUntil = claims.getExpiration().toInstant().plusSeconds(jwtProps.getGuestTtl());
        if (Instant.now().isAfter(renewableUntil)) {
            throw new AuthenticationFailedException("재발급 기간이 지난 게스트 토큰입니다.");
        }
        return new GuestTokenResponse(jwtProvider.generateGuestToken(claims.getSubject()));
    }

    /**
     * 소셜 로그인 URL + state 발급
     */
    public AuthorizeUrlResponse getAuthorizeUrl(String providerName) {
        OAuthProvider provider = oAuthProviderRegistry.get(providerName);
        String stateToken = jwtProvider.generateStateToken();
        String url = provider.generateAuthorizeUrl(stateToken);
        return new AuthorizeUrlResponse(url, stateToken);
    }

    /**
     * 소셜 인가코드 교환 -> 로그인 처리
     */
    @Transactional
    public LoginResponse login(String providerName, String code,
                               String stateToken, HttpServletResponse httpResponse) {
        // 1. state JWT 검증 (단일 파싱: 서명 + role=state 확인)
        Claims stateClaims;
        try {
            stateClaims = jwtProvider.parseToken(stateToken);
        } catch (JwtException | IllegalArgumentException e) {
            throw new AuthenticationFailedException("유효하지 않은 state입니다.");
        }
        if (!"state".equals(stateClaims.get("role", String.class))) {
            throw new AuthenticationFailedException("유효하지 않은 state입니다.");
        }

        // 2. provider 선택
        OAuthProvider provider = oAuthProviderRegistry.get(providerName);

        // 3. 소셜 Access Token 교환
        String socialAccessToken = provider.exchangeCodeForToken(code);

        // 4. 사용자 정보 조회
        OAuthUserInfo userInfo = provider.getUserInfo(socialAccessToken);

        // 5. SocialAccount 조회 -> 없으면 User + SocialAccount 신규 생성 (별도 트랜잭션)
        Optional<SocialAccount> existingAccount = socialAccountRepository
                .findByProviderAndProviderUserId(providerName, userInfo.providerId());

        User user;
        if (existingAccount.isPresent()) {
            // 6. 기존 회원이면 소셜 프로필 동기화 (신규 회원은 create에서 이미 설정됨)
            user = userRepository.findById(existingAccount.get().getUserId())
                    .orElseThrow(() -> new IllegalStateException("사용자를 찾을 수 없습니다."));
            user.updateProfile(userInfo.email(), userInfo.nickname());
        } else {
            user = registerOrFindRegistered(providerName, userInfo);
        }

        // 7. 새 Refresh Token 발급 -> SHA-256 해시 -> DB 저장
        //    (기존 활성 RT는 유지 — 디바이스별 공존 허용. SSE 멀티디바이스 동기화 전제)
        String rawRefreshToken = UUID.randomUUID().toString();
        String tokenHash = sha256(rawRefreshToken);
        Instant expiresAt = Instant.now().plusSeconds(jwtProps.getRefreshTtl());
        refreshTokenRepository.save(RefreshToken.create(user.getId(), tokenHash, expiresAt));

        // 8. Refresh Token -> HttpOnly 쿠키
        setRefreshCookie(httpResponse, rawRefreshToken, jwtProps.getRefreshTtl());

        // 9. Access JWT 발급
        String accessToken = jwtProvider.generateAccessToken(user.getId());
        return new LoginResponse(accessToken, UserResponse.from(user));
    }

    /**
     * Access Token 재발급 (RTR: 기존 RT revoke + 새 RT 발급 + 쿠키 교체)
     */
    @Transactional
    public LoginResponse refresh(String rawRefreshToken, HttpServletResponse httpResponse) {
        String tokenHash = sha256(rawRefreshToken);

        RefreshToken refreshToken = refreshTokenRepository.findByTokenHash(tokenHash)
                .orElseThrow(() -> new AuthenticationFailedException("유효하지 않은 Refresh Token"));

        if (!refreshToken.isValid()) {
            // 폐기된 토큰 재사용 = 탈취 의심 → 해당 사용자의 모든 활성 토큰 revoke
            if (refreshToken.isStolenReuse()) {
                refreshTokenRevoker.revokeAll(refreshToken.getUserId());
            }
            throw new AuthenticationFailedException("만료 또는 폐기된 Refresh Token");
        }

        User user = userRepository.findById(refreshToken.getUserId())
                .orElseThrow(() -> new IllegalStateException("사용자를 찾을 수 없습니다."));

        // RTR: 기존 RT revoke + 새 RT 발급 + 쿠키 교체
        refreshToken.revoke();
        String newRaw = UUID.randomUUID().toString();
        Instant expiresAt = Instant.now().plusSeconds(jwtProps.getRefreshTtl());
        refreshTokenRepository.save(RefreshToken.create(user.getId(), sha256(newRaw), expiresAt));
        setRefreshCookie(httpResponse, newRaw, jwtProps.getRefreshTtl());

        return new LoginResponse(jwtProvider.generateAccessToken(user.getId()), UserResponse.from(user));
    }

    /**
     * 로그아웃
     */
    @Transactional
    public void logout(String refreshToken, HttpServletResponse httpResponse) {
        if (refreshToken != null) {
            refreshTokenRepository.findByTokenHash(sha256(refreshToken))
                    .ifPresent(RefreshToken::revoke);
        }
        clearRefreshCookie(httpResponse);
    }

    /**
     * 신규 회원 생성. 같은 소셜 계정의 첫 로그인이 동시에 들어오면 진 요청은 uq_provider_user 충돌을 받는다.
     * 충돌은 SocialAccountRegistrar의 별도 트랜잭션에서 나므로 로그인 트랜잭션은 rollback-only가 되지 않는다.
     * 같은 트랜잭션에서 다시 읽으면 REPEATABLE READ 스냅샷 때문에 상대가 커밋한 행이 보이지 않으므로,
     * 새 트랜잭션으로 먼저 가입한 회원을 읽어 그 회원으로 로그인시킨다.
     */
    private User registerOrFindRegistered(String providerName, OAuthUserInfo userInfo) {
        try {
            return socialAccountRegistrar.register(providerName, userInfo);
        } catch (DataIntegrityViolationException e) {
            return socialAccountRegistrar.findRegistered(providerName, userInfo.providerId())
                    .orElseThrow(() -> e);
        }
    }

    /* Helpers */
    private void clearRefreshCookie(HttpServletResponse response) {
        ResponseCookie cookie = ResponseCookie.from("refreshToken", "")
                .httpOnly(true)
                .sameSite("Lax")
                .path("/api/auth")
                .maxAge(0)
                .secure(cookieSecure)
                .build();
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }

    private void setRefreshCookie(HttpServletResponse response, String token, long maxAge) {
        ResponseCookie cookie = ResponseCookie.from("refreshToken", token)
                .httpOnly(true)
                .sameSite("Lax")
                .path("/api/auth")
                .maxAge(maxAge)
                .secure(cookieSecure)
                .build();
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }

    private String sha256(String input) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(input.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException(e);
        }
    }
}
