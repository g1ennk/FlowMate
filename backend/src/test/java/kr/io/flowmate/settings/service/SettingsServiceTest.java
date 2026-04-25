package kr.io.flowmate.settings.service;

import kr.io.flowmate.settings.domain.PomodoroConfig;
import kr.io.flowmate.settings.domain.UserSettings;
import kr.io.flowmate.settings.dto.request.AutomationSettingsRequest;
import kr.io.flowmate.settings.dto.request.MiniDayRequest;
import kr.io.flowmate.settings.dto.request.MiniDaysSettingsRequest;
import kr.io.flowmate.settings.dto.request.PomodoroSessionSettingsRequest;
import kr.io.flowmate.settings.dto.response.AutomationSettingsResponse;
import kr.io.flowmate.settings.dto.response.MiniDaysSettingsResponse;
import kr.io.flowmate.settings.dto.response.PomodoroSessionSettingsResponse;
import kr.io.flowmate.settings.dto.response.SettingsResponse;
import kr.io.flowmate.settings.repository.SettingsRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@DisplayName("SettingsService")
class SettingsServiceTest {

    private static final String USER_ID = "c6d4ed5b-9d1e-4ecd-ac4f-9c1490f6fd01";

    @Mock
    private SettingsRepository settingsRepository;

    @InjectMocks
    private SettingsService settingsService;

    @Test
    @DisplayName("getSettings: row 없으면 기본값 응답 + save 호출 안 함 (lazy-write 유지)")
    void getSettings_rowMiss_returnsDefaultsAndSkipsSave() {
        when(settingsRepository.findById(USER_ID)).thenReturn(Optional.empty());

        SettingsResponse response = settingsService.getSettings(USER_ID);

        assertThat(response.pomodoroSession().flowMin()).isEqualTo(25);
        assertThat(response.pomodoroSession().breakMin()).isEqualTo(5);
        assertThat(response.automation().autoStartBreak()).isFalse();
        assertThat(response.miniDays().day1().label()).isEqualTo("오전");
        assertThat(response.miniDays().day1().start()).isEqualTo("06:00");
        verify(settingsRepository, never()).save(any());
    }

    @Test
    @DisplayName("getSettings: row 있으면 저장값 그대로 반환")
    void getSettings_rowHit_returnsStored() {
        UserSettings existing = UserSettings.createWithDefaults(USER_ID);
        existing.updatePomodoro(new PomodoroConfig(40, 8, 20, 5));
        when(settingsRepository.findById(USER_ID)).thenReturn(Optional.of(existing));

        SettingsResponse response = settingsService.getSettings(USER_ID);

        assertThat(response.pomodoroSession().flowMin()).isEqualTo(40);
        assertThat(response.pomodoroSession().cycleEvery()).isEqualTo(5);
        verify(settingsRepository, never()).save(any());
    }

    @Test
    @DisplayName("updatePomodoro: row 없으면 save 1회 호출 (신규 INSERT)")
    void updatePomodoro_rowMiss_savesNewEntity() {
        PomodoroSessionSettingsRequest request = new PomodoroSessionSettingsRequest();
        request.setFlowMin(30);
        request.setBreakMin(10);
        request.setLongBreakMin(20);
        request.setCycleEvery(3);

        when(settingsRepository.findById(USER_ID)).thenReturn(Optional.empty());
        when(settingsRepository.save(any(UserSettings.class))).thenAnswer(inv -> inv.getArgument(0));

        PomodoroSessionSettingsResponse response = settingsService.updatePomodoro(USER_ID, request);

        assertThat(response.flowMin()).isEqualTo(30);
        assertThat(response.breakMin()).isEqualTo(10);
        verify(settingsRepository, times(1)).save(any(UserSettings.class));
    }

    @Test
    @DisplayName("updatePomodoro: row 있으면 dirty checking 으로 수정 (save 호출 없음)")
    void updatePomodoro_rowHit_usesDirtyChecking() {
        UserSettings existing = UserSettings.createWithDefaults(USER_ID);
        PomodoroSessionSettingsRequest request = new PomodoroSessionSettingsRequest();
        request.setFlowMin(40);
        request.setBreakMin(8);
        request.setLongBreakMin(18);
        request.setCycleEvery(5);
        when(settingsRepository.findById(USER_ID)).thenReturn(Optional.of(existing));

        PomodoroSessionSettingsResponse response = settingsService.updatePomodoro(USER_ID, request);

        assertThat(response.flowMin()).isEqualTo(40);
        assertThat(existing.getFlowMin()).isEqualTo(40);
        verify(settingsRepository, never()).save(any());
    }

    @Test
    @DisplayName("updatePomodoro: flowMin 범위 초과면 PomodoroConfig VO IAE 가 서비스 밖으로 전파")
    void updatePomodoro_flowMinOutOfRange_throwsIae() {
        UserSettings existing = UserSettings.createWithDefaults(USER_ID);
        PomodoroSessionSettingsRequest request = new PomodoroSessionSettingsRequest();
        request.setFlowMin(100);
        request.setBreakMin(5);
        request.setLongBreakMin(15);
        request.setCycleEvery(4);
        when(settingsRepository.findById(USER_ID)).thenReturn(Optional.of(existing));

        assertThatThrownBy(() -> settingsService.updatePomodoro(USER_ID, request))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("1 and 90 minutes");
    }

    @Test
    @DisplayName("updateAutomation: row 있으면 dirty checking 으로 boolean 전환 (save 호출 없음)")
    void updateAutomation_rowHit_usesDirtyChecking() {
        UserSettings existing = UserSettings.createWithDefaults(USER_ID);
        AutomationSettingsRequest request = new AutomationSettingsRequest();
        request.setAutoStartBreak(true);
        request.setAutoStartSession(false);
        when(settingsRepository.findById(USER_ID)).thenReturn(Optional.of(existing));

        AutomationSettingsResponse response = settingsService.updateAutomation(USER_ID, request);

        assertThat(response.autoStartBreak()).isTrue();
        assertThat(response.autoStartSession()).isFalse();
        assertThat(existing.isAutoStartBreak()).isTrue();
        verify(settingsRepository, never()).save(any());
    }

    @Test
    @DisplayName("updateMiniDays: HH:mm 문자열을 minutes 로 변환해서 저장 (24:00 → 1440 포함)")
    void updateMiniDays_convertsDtoTimesAndStoresMinutes() {
        UserSettings existing = UserSettings.createWithDefaults(USER_ID);
        MiniDaysSettingsRequest request = miniDaysRequest(
                dayRequest("새벽", "00:00", "06:00"),
                dayRequest("낮", "06:00", "18:00"),
                dayRequest("밤", "18:00", "24:00")
        );
        when(settingsRepository.findById(USER_ID)).thenReturn(Optional.of(existing));

        MiniDaysSettingsResponse response = settingsService.updateMiniDays(USER_ID, request);

        assertThat(response.day1().start()).isEqualTo("00:00");
        assertThat(response.day3().end()).isEqualTo("24:00");
        assertThat(existing.getDay1StartMin()).isZero();
        assertThat(existing.getDay3EndMin()).isEqualTo(1440);
    }

    @Test
    @DisplayName("updateMiniDays: 시작이 종료 이후이면 MiniDay VO IAE 가 서비스 밖으로 전파")
    void updateMiniDays_startAfterEnd_throwsIae() {
        UserSettings existing = UserSettings.createWithDefaults(USER_ID);
        MiniDaysSettingsRequest request = miniDaysRequest(
                dayRequest("오전", "12:00", "06:00"),
                dayRequest("오후", "12:00", "18:00"),
                dayRequest("저녁", "18:00", "24:00")
        );
        when(settingsRepository.findById(USER_ID)).thenReturn(Optional.of(existing));

        assertThatThrownBy(() -> settingsService.updateMiniDays(USER_ID, request))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Start time must be before end time");
    }

    private MiniDayRequest dayRequest(String label, String start, String end) {
        MiniDayRequest day = new MiniDayRequest();
        day.setLabel(label);
        day.setStart(start);
        day.setEnd(end);
        return day;
    }

    private MiniDaysSettingsRequest miniDaysRequest(MiniDayRequest d1, MiniDayRequest d2, MiniDayRequest d3) {
        MiniDaysSettingsRequest req = new MiniDaysSettingsRequest();
        req.setDay1(d1);
        req.setDay2(d2);
        req.setDay3(d3);
        return req;
    }
}
