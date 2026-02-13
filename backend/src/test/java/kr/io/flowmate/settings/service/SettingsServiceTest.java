package kr.io.flowmate.settings.service;

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
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("SettingsServiceTest")
class SettingsServiceTest {

    @Mock
    private SettingsRepository settingsRepository;

    @InjectMocks
    private SettingsService settingsService;

    @Test
    @DisplayName("getSettings: 사용자 없을 때 기본값 반환 (DB 저장 안 함)")
    void getSettings_신규사용자_기본값반환() {
        // given
        String userId = "c6d4ed5b-9d1e-4ecd-ac4f-9c1490f6fd01";
        when(settingsRepository.findById(userId)).thenReturn(Optional.empty());

        // when
        SettingsResponse response = settingsService.getSettings(userId);

        // then
        assertThat(response).isNotNull();
        assertThat(response.getPomodoroSession().getFlowMin()).isEqualTo(25);
        assertThat(response.getPomodoroSession().getBreakMin()).isEqualTo(5);
        assertThat(response.getAutomation().isAutoStartBreak()).isFalse();
        assertThat(response.getMiniDays().getDay1().getLabel()).isEqualTo("오전");

        verify(settingsRepository, never()).save(any());
    }

    @Test
    @DisplayName("updatePomodoro: 첫 PUT 시 DB 생성")
    void updatePomodoro_첫저장_DB생성() {
        // given
        String userId = "c6d4ed5b-9d1e-4ecd-ac4f-9c1490f6fd01";
        PomodoroSessionSettingsRequest request = new PomodoroSessionSettingsRequest();
        request.setFlowMin(30);
        request.setBreakMin(10);
        request.setLongBreakMin(20);
        request.setCycleEvery(3);

        when(settingsRepository.findById(userId)).thenReturn(Optional.empty());
        when(settingsRepository.save(any(UserSettings.class))).thenAnswer(invocation -> invocation.getArgument(0));

        // when
        PomodoroSessionSettingsResponse response = settingsService.updatePomodoro(userId, request);

        // then
        assertThat(response.getFlowMin()).isEqualTo(30);
        assertThat(response.getBreakMin()).isEqualTo(10);
        verify(settingsRepository, times(1)).save(any(UserSettings.class));
    }

    @Test
    @DisplayName("updatePomodoro: 기존 사용자 수정 (Dirty Checking)")
    void updatePomodoro_기존사용자_수정() {
        // given
        String userId = "c6d4ed5b-9d1e-4ecd-ac4f-9c1490f6fd01";
        UserSettings existingSettings = UserSettings.createWithDefaults(userId);

        PomodoroSessionSettingsRequest request = new PomodoroSessionSettingsRequest();
        request.setFlowMin(40);
        request.setBreakMin(8);
        request.setLongBreakMin(18);
        request.setCycleEvery(5);

        when(settingsRepository.findById(userId)).thenReturn(Optional.of(existingSettings));

        // when
        PomodoroSessionSettingsResponse response = settingsService.updatePomodoro(userId, request);

        // then
        assertThat(response.getFlowMin()).isEqualTo(40);
        assertThat(response.getBreakMin()).isEqualTo(8);
        assertThat(existingSettings.getFlowMin()).isEqualTo(40);

        verify(settingsRepository, never()).save(any());
    }

    @Test
    @DisplayName("updateMiniDays: 시간 형식 변환 확인")
    void updateMiniDays_시간형식변환() {
        // given
        String userId = "c6d4ed5b-9d1e-4ecd-ac4f-9c1490f6fd01";
        UserSettings existingSettings = UserSettings.createWithDefaults(userId);

        MiniDaysSettingsRequest request = new MiniDaysSettingsRequest();

        MiniDayRequest day1 = new MiniDayRequest();
        day1.setLabel("새벽");
        day1.setStart("00:00");
        day1.setEnd("06:00");

        MiniDayRequest day2 = new MiniDayRequest();
        day2.setLabel("낮");
        day2.setStart("06:00");
        day2.setEnd("18:00");

        MiniDayRequest day3 = new MiniDayRequest();
        day3.setLabel("밤");
        day3.setStart("18:00");
        day3.setEnd("24:00");

        request.setDay1(day1);
        request.setDay2(day2);
        request.setDay3(day3);

        when(settingsRepository.findById(userId)).thenReturn(Optional.of(existingSettings));

        // when
        MiniDaysSettingsResponse response = settingsService.updateMiniDays(userId, request);

        // then
        assertThat(response.getDay1().getLabel()).isEqualTo("새벽");
        assertThat(response.getDay1().getStart()).isEqualTo("00:00");
        assertThat(response.getDay1().getEnd()).isEqualTo("06:00");

        assertThat(existingSettings.getDay1StartMin()).isEqualTo(0);
        assertThat(existingSettings.getDay1EndMin()).isEqualTo(360);
    }

    @Test
    @DisplayName("getAutomation: 사용자 없을 때 기본값 반환 (DB 저장 안 함)")
    void getAutomation_신규사용자_기본값반환() {
        // given
        String userId = "c6d4ed5b-9d1e-4ecd-ac4f-9c1490f6fd01";
        when(settingsRepository.findById(userId)).thenReturn(Optional.empty());

        // when
        AutomationSettingsResponse response = settingsService.getAutomation(userId);

        // then
        assertThat(response).isNotNull();
        assertThat(response.isAutoStartBreak()).isFalse();
        assertThat(response.isAutoStartSession()).isFalse();
        verify(settingsRepository, never()).save(any());
    }

    @Test
    @DisplayName("updateAutomation: 첫 PUT 시 DB 생성")
    void updateAutomation_첫저장_DB생성() {
        // given
        String userId = "c6d4ed5b-9d1e-4ecd-ac4f-9c1490f6fd01";
        AutomationSettingsRequest request = new AutomationSettingsRequest();
        request.setAutoStartBreak(true);
        request.setAutoStartSession(true);

        when(settingsRepository.findById(userId)).thenReturn(Optional.empty());
        when(settingsRepository.save(any(UserSettings.class))).thenAnswer(invocation -> invocation.getArgument(0));

        // when
        AutomationSettingsResponse response = settingsService.updateAutomation(userId, request);

        // then
        assertThat(response.isAutoStartBreak()).isTrue();
        assertThat(response.isAutoStartSession()).isTrue();
        verify(settingsRepository, times(1)).save(any(UserSettings.class));
    }

    @Test
    @DisplayName("updateAutomation: 기존 사용자 수정 (Dirty Checking)")
    void updateAutomation_기존사용자_수정() {
        // given
        String userId = "c6d4ed5b-9d1e-4ecd-ac4f-9c1490f6fd01";
        UserSettings existingSettings = UserSettings.createWithDefaults(userId);

        AutomationSettingsRequest request = new AutomationSettingsRequest();
        request.setAutoStartBreak(true);
        request.setAutoStartSession(false);

        when(settingsRepository.findById(userId)).thenReturn(Optional.of(existingSettings));

        // when
        AutomationSettingsResponse response = settingsService.updateAutomation(userId, request);

        // then
        assertThat(response.isAutoStartBreak()).isTrue();
        assertThat(response.isAutoStartSession()).isFalse();
        assertThat(existingSettings.isAutoStartBreak()).isTrue();
        assertThat(existingSettings.isAutoStartSession()).isFalse();
        verify(settingsRepository, never()).save(any());
    }

    @Test
    @DisplayName("updatePomodoro: flowMin 범위 초과 시 예외 발생")
    void updatePomodoro_flowMin_범위초과_예외발생() {
        // given
        String userId = "c6d4ed5b-9d1e-4ecd-ac4f-9c1490f6fd01";
        UserSettings existingSettings = UserSettings.createWithDefaults(userId);

        PomodoroSessionSettingsRequest request = new PomodoroSessionSettingsRequest();
        request.setFlowMin(100);
        request.setBreakMin(5);
        request.setLongBreakMin(15);
        request.setCycleEvery(4);

        when(settingsRepository.findById(userId)).thenReturn(Optional.of(existingSettings));

        // when & then
        assertThatThrownBy(() -> settingsService.updatePomodoro(userId, request))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Flow time must be between 1 and 90 minutes");
    }

    @Test
    @DisplayName("updatePomodoro: 최소/최대 경계값 정상 처리")
    void updatePomodoro_경계값_정상처리() {
        // given
        String userId = "c6d4ed5b-9d1e-4ecd-ac4f-9c1490f6fd01";
        UserSettings existingSettings = UserSettings.createWithDefaults(userId);

        PomodoroSessionSettingsRequest minRequest = new PomodoroSessionSettingsRequest();
        minRequest.setFlowMin(1);
        minRequest.setBreakMin(1);
        minRequest.setLongBreakMin(1);
        minRequest.setCycleEvery(1);

        PomodoroSessionSettingsRequest maxRequest = new PomodoroSessionSettingsRequest();
        maxRequest.setFlowMin(90);
        maxRequest.setBreakMin(90);
        maxRequest.setLongBreakMin(90);
        maxRequest.setCycleEvery(10);

        when(settingsRepository.findById(userId)).thenReturn(Optional.of(existingSettings));

        // when
        PomodoroSessionSettingsResponse minResponse = settingsService.updatePomodoro(userId, minRequest);
        PomodoroSessionSettingsResponse maxResponse = settingsService.updatePomodoro(userId, maxRequest);

        // then
        assertThat(minResponse.getFlowMin()).isEqualTo(1);
        assertThat(minResponse.getBreakMin()).isEqualTo(1);
        assertThat(minResponse.getLongBreakMin()).isEqualTo(1);
        assertThat(minResponse.getCycleEvery()).isEqualTo(1);
        assertThat(maxResponse.getFlowMin()).isEqualTo(90);
        assertThat(maxResponse.getBreakMin()).isEqualTo(90);
        assertThat(maxResponse.getLongBreakMin()).isEqualTo(90);
        assertThat(maxResponse.getCycleEvery()).isEqualTo(10);
        verify(settingsRepository, never()).save(any());
    }

    @Test
    @DisplayName("updateMiniDays: 시작 시간이 종료 시간보다 늦으면 예외 발생")
    void updateMiniDays_시작시간이_종료시간이후_예외발생() {
        // given
        String userId = "c6d4ed5b-9d1e-4ecd-ac4f-9c1490f6fd01";
        UserSettings existingSettings = UserSettings.createWithDefaults(userId);

        MiniDayRequest invalidDay = new MiniDayRequest();
        invalidDay.setLabel("오전");
        invalidDay.setStart("12:00");
        invalidDay.setEnd("06:00");

        MiniDayRequest validDay2 = new MiniDayRequest();
        validDay2.setLabel("오후");
        validDay2.setStart("12:00");
        validDay2.setEnd("18:00");

        MiniDayRequest validDay3 = new MiniDayRequest();
        validDay3.setLabel("저녁");
        validDay3.setStart("18:00");
        validDay3.setEnd("24:00");

        MiniDaysSettingsRequest request = new MiniDaysSettingsRequest();
        request.setDay1(invalidDay);
        request.setDay2(validDay2);
        request.setDay3(validDay3);

        when(settingsRepository.findById(userId)).thenReturn(Optional.of(existingSettings));

        // when & then
        assertThatThrownBy(() -> settingsService.updateMiniDays(userId, request))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Start time must be before end time");
    }

    @Test
    @DisplayName("updateMiniDays: label 50자 초과 시 예외 발생")
    void updateMiniDays_라벨길이초과_예외발생() {
        // given
        String userId = "c6d4ed5b-9d1e-4ecd-ac4f-9c1490f6fd01";
        UserSettings existingSettings = UserSettings.createWithDefaults(userId);

        MiniDayRequest day1 = new MiniDayRequest();
        day1.setLabel("a".repeat(51));
        day1.setStart("06:00");
        day1.setEnd("12:00");

        MiniDayRequest day2 = new MiniDayRequest();
        day2.setLabel("오후");
        day2.setStart("12:00");
        day2.setEnd("18:00");

        MiniDayRequest day3 = new MiniDayRequest();
        day3.setLabel("저녁");
        day3.setStart("18:00");
        day3.setEnd("24:00");

        MiniDaysSettingsRequest request = new MiniDaysSettingsRequest();
        request.setDay1(day1);
        request.setDay2(day2);
        request.setDay3(day3);

        when(settingsRepository.findById(userId)).thenReturn(Optional.of(existingSettings));

        // when & then
        assertThatThrownBy(() -> settingsService.updateMiniDays(userId, request))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Label cannot exceed 50 characters");
    }

    @Test
    @DisplayName("updateMiniDays: 종료 시간 24:00 정상 처리")
    void updateMiniDays_종료시간24시_정상처리() {
        // given
        String userId = "c6d4ed5b-9d1e-4ecd-ac4f-9c1490f6fd01";
        UserSettings existingSettings = UserSettings.createWithDefaults(userId);

        MiniDayRequest day1 = new MiniDayRequest();
        day1.setLabel("종일");
        day1.setStart("00:00");
        day1.setEnd("24:00");

        MiniDayRequest day2 = new MiniDayRequest();
        day2.setLabel("오후");
        day2.setStart("12:00");
        day2.setEnd("18:00");

        MiniDayRequest day3 = new MiniDayRequest();
        day3.setLabel("저녁");
        day3.setStart("18:00");
        day3.setEnd("23:00");

        MiniDaysSettingsRequest request = new MiniDaysSettingsRequest();
        request.setDay1(day1);
        request.setDay2(day2);
        request.setDay3(day3);

        when(settingsRepository.findById(userId)).thenReturn(Optional.of(existingSettings));

        // when
        MiniDaysSettingsResponse response = settingsService.updateMiniDays(userId, request);

        // then
        assertThat(response.getDay1().getEnd()).isEqualTo("24:00");
        assertThat(existingSettings.getDay1EndMin()).isEqualTo(1440);
    }
}
