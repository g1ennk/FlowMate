package kr.io.flowmate.settings.service;

import kr.io.flowmate.settings.domain.PomodoroConfig;
import kr.io.flowmate.settings.domain.UserSettings;
import kr.io.flowmate.settings.dto.request.AutomationSettingsRequest;
import kr.io.flowmate.settings.dto.request.MiniDaysSettingsRequest;
import kr.io.flowmate.settings.dto.request.PomodoroSessionSettingsRequest;
import kr.io.flowmate.settings.dto.response.AutomationSettingsResponse;
import kr.io.flowmate.settings.dto.response.MiniDaysSettingsResponse;
import kr.io.flowmate.settings.dto.response.PomodoroSessionSettingsResponse;
import kr.io.flowmate.settings.dto.response.SettingsResponse;
import kr.io.flowmate.settings.repository.SettingsRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class SettingsService {

    private final SettingsRepository settingsRepository;

    public SettingsResponse getSettings(String userId) {
        UserSettings settings = getOrDefault(userId);
        return SettingsResponse.from(settings);
    }

    @Transactional
    public PomodoroSessionSettingsResponse updatePomodoro(String userId, PomodoroSessionSettingsRequest request) {
        UserSettings settings = getOrCreate(userId);
        settings.updatePomodoro(new PomodoroConfig(
                request.getFlowMin(),
                request.getBreakMin(),
                request.getLongBreakMin(),
                request.getCycleEvery()
        ));
        return PomodoroSessionSettingsResponse.from(settings);
    }

    @Transactional
    public AutomationSettingsResponse updateAutomation(String userId, AutomationSettingsRequest request) {
        UserSettings settings = getOrCreate(userId);
        settings.updateAutomation(request.getAutoStartBreak(), request.getAutoStartSession());
        return AutomationSettingsResponse.from(settings);
    }

    public MiniDaysSettingsResponse getMiniDays(String userId) {
        UserSettings settings = getOrDefault(userId);
        return MiniDaysSettingsResponse.from(settings);
    }

    @Transactional
    public MiniDaysSettingsResponse updateMiniDays(String userId, MiniDaysSettingsRequest request) {
        UserSettings settings = getOrCreate(userId);
        settings.updateMiniDays(
                request.getDay1().toMiniDay(),
                request.getDay2().toMiniDay(),
                request.getDay3().toMiniDay()
        );
        return MiniDaysSettingsResponse.from(settings);
    }

    private UserSettings getOrDefault(String userId) {
        return settingsRepository.findById(userId).orElse(UserSettings.createWithDefaults(userId));
    }

    // 조회 후 INSERT 대신 "없으면 기본값 행 생성"을 한 문장으로 처리한다. 두 탭에서 동시에 처음 저장해도 충돌하지 않는다
    private UserSettings getOrCreate(String userId) {
        settingsRepository.insertDefaultsIfAbsent(userId, Instant.now().truncatedTo(ChronoUnit.SECONDS));
        return settingsRepository.findByIdForUpdate(userId)
                .orElseThrow(() -> new IllegalStateException("설정 행을 찾을 수 없습니다."));
    }

}
