package kr.io.flowmate.settings.controller;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import kr.io.flowmate.common.util.ClientIdResolver;
import kr.io.flowmate.settings.dto.request.AutomationSettingsRequest;
import kr.io.flowmate.settings.dto.request.MiniDaysSettingsRequest;
import kr.io.flowmate.settings.dto.request.PomodoroSessionSettingsRequest;
import kr.io.flowmate.settings.dto.response.AutomationSettingsResponse;
import kr.io.flowmate.settings.dto.response.MiniDaysSettingsResponse;
import kr.io.flowmate.settings.dto.response.PomodoroSessionSettingsResponse;
import kr.io.flowmate.settings.dto.response.SettingsResponse;
import kr.io.flowmate.settings.service.SettingsService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/settings")
@RequiredArgsConstructor
public class SettingsController {

    private final SettingsService settingsService;
    private final ClientIdResolver clientIdResolver;

    // 전체 설정 불러오기
    @GetMapping
    public ResponseEntity<SettingsResponse> getSettings(HttpServletRequest request) {
        String userId = clientIdResolver.resolve(request);
        SettingsResponse settings = settingsService.getSettings(userId);
        return ResponseEntity.ok(settings);
    }

    @PutMapping("/pomodoro-session")
    public ResponseEntity<PomodoroSessionSettingsResponse> updatePomodoroSession(
            HttpServletRequest request,
            @Valid @RequestBody PomodoroSessionSettingsRequest updateRequest
    ) {
        String userId = clientIdResolver.resolve(request);
        PomodoroSessionSettingsResponse updated = settingsService.updatePomodoro(userId, updateRequest);
        return ResponseEntity.ok(updated);
    }

    @PutMapping("/automation")
    public ResponseEntity<AutomationSettingsResponse> updateAutomation(
            HttpServletRequest request,
            @Valid @RequestBody AutomationSettingsRequest updateRequest
    ) {
        String userId = clientIdResolver.resolve(request);
        AutomationSettingsResponse updated = settingsService.updateAutomation(userId, updateRequest);
        return ResponseEntity.ok(updated);
    }

    // 미니데이
    @GetMapping("/mini-days")
    public ResponseEntity<MiniDaysSettingsResponse> getMiniDays(HttpServletRequest request) {
        String userId = clientIdResolver.resolve(request);
        MiniDaysSettingsResponse settings = settingsService.getMiniDays(userId);
        return ResponseEntity.ok(settings);
    }

    @PutMapping("/mini-days")
    public ResponseEntity<MiniDaysSettingsResponse> updateMiniDays(
            HttpServletRequest request,
            @Valid @RequestBody MiniDaysSettingsRequest updateRequest
    ) {
        String userId = clientIdResolver.resolve(request);
        MiniDaysSettingsResponse updated = settingsService.updateMiniDays(userId, updateRequest);
        return ResponseEntity.ok(updated);
    }

}
