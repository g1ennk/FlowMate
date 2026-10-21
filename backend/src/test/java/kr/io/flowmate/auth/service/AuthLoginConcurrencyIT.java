package kr.io.flowmate.auth.service;

import kr.io.flowmate.auth.dto.response.LoginResponse;
import kr.io.flowmate.auth.jwt.JwtProvider;
import kr.io.flowmate.auth.oauth.OAuthProvider;
import kr.io.flowmate.auth.oauth.OAuthUserInfo;
import kr.io.flowmate.support.Concurrently;
import kr.io.flowmate.support.Concurrently.Outcome;
import kr.io.flowmate.support.MySqlIntegrationTest;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletResponse;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 같은 소셜 계정의 동시 첫 로그인(auth_social_accounts uq_provider_user)을 실제 MySQL 8.0에서 검증한다.
 * 카카오 대신 인가코드를 그대로 소셜 사용자 ID로 돌려주는 테스트용 provider를 쓴다.
 */
@Import(AuthLoginConcurrencyIT.FakeProviderConfig.class)
class AuthLoginConcurrencyIT extends MySqlIntegrationTest {

    private static final int ROUNDS = 30;
    private static final int WRITERS = 4;
    private static final String PROVIDER = "it-fake";

    private static ExecutorService executor;

    @Autowired
    private AuthService authService;

    @Autowired
    private JwtProvider jwtProvider;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeAll
    static void startExecutor() {
        executor = Executors.newFixedThreadPool(WRITERS);
    }

    @AfterAll
    static void stopExecutor() {
        executor.shutdownNow();
    }

    @Test
    void 같은_소셜_계정_동시_첫_로그인은_모두_성공하고_같은_사용자로_로그인된다() throws Exception {
        List<String> failures = new ArrayList<>();
        for (int round = 0; round < ROUNDS; round++) {
            String providerUserId = "it-" + UUID.randomUUID();

            List<Outcome<LoginResponse>> outcomes = Concurrently.run(executor, loginTasks(providerUserId));

            failures.addAll(Concurrently.failures(outcomes));
            assertThat(socialAccountCount(providerUserId)).as("round %d", round).isEqualTo(1);
            assertThat(userCountByEmail(providerUserId)).as("round %d 고아 사용자 없음", round).isEqualTo(1);
            String userId = jdbcTemplate.queryForObject(
                    "select user_id from auth_social_accounts where provider = ? and provider_user_id = ?",
                    String.class, PROVIDER, providerUserId);
            assertThat(Concurrently.values(outcomes)).as("round %d", round)
                    .extracting(response -> response.user().id())
                    .containsOnly(userId);
            assertThat(activeRefreshTokenCount(userId)).as("round %d", round)
                    .isEqualTo(Concurrently.values(outcomes).size());
        }
        System.out.printf("[login first-create] attempts=%d failures=%d %s%n",
                ROUNDS * WRITERS, failures.size(), failures);
        assertThat(failures).isEmpty();
    }

    @Test
    void 이미_가입한_계정의_로그인은_기존_사용자로_로그인하고_프로필을_동기화한다() {
        String providerUserId = "it-" + UUID.randomUUID();
        String firstUserId = login(providerUserId).user().id();
        jdbcTemplate.update("update users set nickname = 'old' where id = ?", firstUserId);

        LoginResponse second = login(providerUserId);

        assertThat(second.user().id()).isEqualTo(firstUserId);
        assertThat(second.user().nickname()).isEqualTo(FakeProvider.NICKNAME);
        assertThat(jdbcTemplate.queryForObject("select nickname from users where id = ?", String.class, firstUserId))
                .isEqualTo(FakeProvider.NICKNAME);
        assertThat(socialAccountCount(providerUserId)).isEqualTo(1);
    }

    private List<Callable<LoginResponse>> loginTasks(String providerUserId) {
        List<Callable<LoginResponse>> tasks = new ArrayList<>();
        for (int writer = 0; writer < WRITERS; writer++) {
            tasks.add(() -> login(providerUserId));
        }
        return tasks;
    }

    private LoginResponse login(String providerUserId) {
        return authService.login(PROVIDER, providerUserId, jwtProvider.generateStateToken(),
                new MockHttpServletResponse());
    }

    private int socialAccountCount(String providerUserId) {
        return jdbcTemplate.queryForObject(
                "select count(*) from auth_social_accounts where provider = ? and provider_user_id = ?",
                Integer.class, PROVIDER, providerUserId);
    }

    private int userCountByEmail(String providerUserId) {
        return jdbcTemplate.queryForObject(
                "select count(*) from users where email = ?", Integer.class, FakeProvider.email(providerUserId));
    }

    private int activeRefreshTokenCount(String userId) {
        return jdbcTemplate.queryForObject(
                "select count(*) from auth_refresh_tokens where user_id = ? and revoked_at is null",
                Integer.class, userId);
    }

    @TestConfiguration
    static class FakeProviderConfig {

        @Bean
        OAuthProvider fakeOAuthProvider() {
            return new FakeProvider();
        }
    }

    /** 인가코드를 그대로 소셜 Access Token과 소셜 사용자 ID로 쓴다. 상태가 없어 여러 스레드에서 동시에 불러도 된다. */
    static class FakeProvider implements OAuthProvider {

        static final String NICKNAME = "동시성";

        static String email(String providerUserId) {
            return providerUserId + "@it.test";
        }

        @Override
        public String getProviderName() {
            return PROVIDER;
        }

        @Override
        public String generateAuthorizeUrl(String stateToken) {
            return "http://localhost/authorize?state=" + stateToken;
        }

        @Override
        public String exchangeCodeForToken(String code) {
            return code;
        }

        @Override
        public OAuthUserInfo getUserInfo(String accessToken) {
            return new OAuthUserInfo(accessToken, email(accessToken), NICKNAME);
        }
    }
}
