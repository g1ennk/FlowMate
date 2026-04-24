package kr.io.flowmate.settings.controller;

import jakarta.validation.Valid;
import kr.io.flowmate.common.annotation.CurrentUser;
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
        SettingsResponse settings = settingsService.getSettings(userId);
        return ResponseEntity.ok(settings);
    }

    @PutMapping("/pomodoro-session")
    public ResponseEntity<PomodoroSessionSettingsResponse> updatePomodoroSession(
            @CurrentUser String userId,
            @Valid @RequestBody PomodoroSessionSettingsRequest updateRequest
    ) {
        PomodoroSessionSettingsResponse updated = settingsService.updatePomodoro(userId, updateRequest);
        return ResponseEntity.ok(updated);
    }

    @PutMapping("/automation")
    public ResponseEntity<AutomationSettingsResponse> updateAutomation(
            @CurrentUser String userId,
            @Valid @RequestBody AutomationSettingsRequest updateRequest
    ) {
        AutomationSettingsResponse updated = settingsService.updateAutomation(userId, updateRequest);
        return ResponseEntity.ok(updated);
    }

    @GetMapping("/mini-days")
    public ResponseEntity<MiniDaysSettingsResponse> getMiniDays(@CurrentUser String userId) {
        MiniDaysSettingsResponse settings = settingsService.getMiniDays(userId);
        return ResponseEntity.ok(settings);
    }

    @PutMapping("/mini-days")
    public ResponseEntity<MiniDaysSettingsResponse> updateMiniDays(
            @CurrentUser String userId,
            @Valid @RequestBody MiniDaysSettingsRequest updateRequest
    ) {
        MiniDaysSettingsResponse updated = settingsService.updateMiniDays(userId, updateRequest);
        return ResponseEntity.ok(updated);
    }

}
