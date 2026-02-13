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

@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class SettingsService {

    private final SettingsRepository settingsRepository;

    // 전체 세팅값 조회
    public SettingsResponse getSettings(String userId) {
        UserSettings settings = getOrDefault(userId);
        return SettingsResponse.from(settings);
    }

    // 뽀모도로 세션
    public PomodoroSessionSettingsResponse getPomodoro(String userId) {
        UserSettings settings = getOrDefault(userId);
        return PomodoroSessionSettingsResponse.from(settings);
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

    // 자동화
    public AutomationSettingsResponse getAutomation(String userId) {
        UserSettings settings = getOrDefault(userId);
        return AutomationSettingsResponse.from(settings);
    }

    @Transactional
    public AutomationSettingsResponse updateAutomation(String userId, AutomationSettingsRequest request) {
        UserSettings settings = getOrCreate(userId);
        settings.updateAutomation(request.getAutoStartBreak(), request.getAutoStartSession());
        return AutomationSettingsResponse.from(settings);
    }

    // 미니데이
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

    private UserSettings getOrCreate(String userId) {
        return settingsRepository.findById(userId).orElseGet(() -> settingsRepository.save(UserSettings.createWithDefaults(userId)));
    }

}
