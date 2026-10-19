package kr.io.flowmate.settings.service;

import kr.io.flowmate.settings.domain.UserSettings;
import kr.io.flowmate.settings.dto.request.AutomationSettingsRequest;
import kr.io.flowmate.settings.dto.request.PomodoroSessionSettingsRequest;
import kr.io.flowmate.settings.dto.response.PomodoroSessionSettingsResponse;
import kr.io.flowmate.settings.dto.response.SettingsResponse;
import kr.io.flowmate.support.Concurrently;
import kr.io.flowmate.support.Concurrently.Outcome;
import kr.io.flowmate.support.MySqlIntegrationTest;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 설정 행(user_settings, PK user_id)이 없는 사용자의 동시 첫 저장을 실제 MySQL 8.0에서 검증한다.
 * 4건을 CyclicBarrier로 동시에 출발시키는 라운드를 30번 반복한다.
 */
class SettingsConcurrencyIT extends MySqlIntegrationTest {

    private static final int ROUNDS = 30;
    private static final int WRITERS = 4;

    private static ExecutorService executor;

    @Autowired
    private SettingsService settingsService;

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
    void 설정이_없는_사용자의_동시_첫_저장은_모두_성공하고_행은_하나다() throws Exception {
        List<String> failures = new ArrayList<>();
        for (int round = 0; round < ROUNDS; round++) {
            String userId = newUser();
            List<Callable<PomodoroSessionSettingsResponse>> tasks = new ArrayList<>();
            for (int writer = 0; writer < WRITERS; writer++) {
                PomodoroSessionSettingsRequest body = pomodoro(30 + writer);
                tasks.add(() -> settingsService.updatePomodoro(userId, body));
            }

            List<Outcome<PomodoroSessionSettingsResponse>> outcomes = Concurrently.run(executor, tasks);

            failures.addAll(Concurrently.failures(outcomes));
            assertThat(settingsRowCount(userId)).as("round %d", round).isEqualTo(1);
            Integer savedFlowMin = jdbcTemplate.queryForObject(
                    "select flow_min from user_settings where user_id = ?", Integer.class, userId);
            assertThat(Concurrently.values(outcomes)).as("round %d", round)
                    .extracting(PomodoroSessionSettingsResponse::flowMin)
                    .contains(savedFlowMin);
        }
        System.out.printf("[settings first-create] attempts=%d failures=%d %s%n",
                ROUNDS * WRITERS, failures.size(), failures);
        assertThat(failures).isEmpty();
    }

    @Test
    void 첫_저장으로_만든_행은_바꾸지_않은_항목에_기본값을_가진다() {
        String userId = newUser();
        AutomationSettingsRequest request = new AutomationSettingsRequest();
        request.setAutoStartBreak(true);
        request.setAutoStartSession(true);

        settingsService.updateAutomation(userId, request);

        SettingsResponse saved = settingsService.getSettings(userId);
        SettingsResponse defaults = SettingsResponse.from(UserSettings.createWithDefaults(userId));
        assertThat(saved.pomodoroSession()).isEqualTo(defaults.pomodoroSession());
        assertThat(saved.miniDays()).isEqualTo(defaults.miniDays());
        assertThat(saved.automation().autoStartBreak()).isTrue();
        assertThat(saved.automation().autoStartSession()).isTrue();
    }

    private int settingsRowCount(String userId) {
        return jdbcTemplate.queryForObject(
                "select count(*) from user_settings where user_id = ?", Integer.class, userId);
    }

    private static PomodoroSessionSettingsRequest pomodoro(int flowMin) {
        PomodoroSessionSettingsRequest request = new PomodoroSessionSettingsRequest();
        request.setFlowMin(flowMin);
        request.setBreakMin(5);
        request.setLongBreakMin(15);
        request.setCycleEvery(4);
        return request;
    }

    private static String newUser() {
        return "it-" + UUID.randomUUID().toString().substring(0, 8);
    }
}
