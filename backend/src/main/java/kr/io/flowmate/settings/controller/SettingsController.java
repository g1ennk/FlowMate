package kr.io.flowmate.settings.controller;

import jakarta.validation.Valid;
import kr.io.flowmate.common.web.CurrentUser;
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

    @GetMapping
    public ResponseEntity<SettingsResponse> getSettings(@CurrentUser String userId) {
        return ResponseEntity.ok(settingsService.getSettings(userId));
    }

    @PutMapping("/pomodoro-session")
    public ResponseEntity<PomodoroSessionSettingsResponse> updatePomodoroSession(
            @CurrentUser String userId,
            @Valid @RequestBody PomodoroSessionSettingsRequest updateRequest
    ) {
        return ResponseEntity.ok(settingsService.updatePomodoro(userId, updateRequest));
    }

    @PutMapping("/automation")
    public ResponseEntity<AutomationSettingsResponse> updateAutomation(
            @CurrentUser String userId,
            @Valid @RequestBody AutomationSettingsRequest updateRequest
    ) {
        return ResponseEntity.ok(settingsService.updateAutomation(userId, updateRequest));
    }

    @GetMapping("/mini-days")
    public ResponseEntity<MiniDaysSettingsResponse> getMiniDays(@CurrentUser String userId) {
        return ResponseEntity.ok(settingsService.getMiniDays(userId));
    }

    @PutMapping("/mini-days")
    public ResponseEntity<MiniDaysSettingsResponse> updateMiniDays(
            @CurrentUser String userId,
            @Valid @RequestBody MiniDaysSettingsRequest updateRequest
    ) {
        return ResponseEntity.ok(settingsService.updateMiniDays(userId, updateRequest));
    }
}
