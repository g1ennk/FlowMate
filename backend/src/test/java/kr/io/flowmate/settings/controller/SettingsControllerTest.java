package kr.io.flowmate.settings.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import kr.io.flowmate.common.util.CurrentUserResolver;
import kr.io.flowmate.common.web.CurrentUserArgumentResolver;
import kr.io.flowmate.common.web.GlobalExceptionHandler;
import kr.io.flowmate.settings.domain.UserSettings;
import kr.io.flowmate.settings.dto.request.MiniDayRequest;
import kr.io.flowmate.settings.dto.request.MiniDaysSettingsRequest;
import kr.io.flowmate.settings.dto.request.PomodoroSessionSettingsRequest;
import kr.io.flowmate.settings.dto.response.SettingsResponse;
import kr.io.flowmate.settings.service.SettingsService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
@DisplayName("SettingsController")
class SettingsControllerTest {

    private static final String USER_ID = "c6d4ed5b-9d1e-4ecd-ac4f-9c1490f6fd01";

    @Mock
    private SettingsService settingsService;

    @Mock
    private CurrentUserResolver currentUserResolver;

    private MockMvc mockMvc;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        SettingsController controller = new SettingsController(settingsService);
        mockMvc = MockMvcBuilders.standaloneSetup(controller)
                .setControllerAdvice(new GlobalExceptionHandler())
                .setCustomArgumentResolvers(new CurrentUserArgumentResolver(currentUserResolver))
                .build();
    }

    @Test
    @DisplayName("GET /api/settings: 200 + 기본값 응답 (lazy-write 계약 유지)")
    void getSettings_returns200WithDefaults() throws Exception {
        when(currentUserResolver.resolve()).thenReturn(USER_ID);
        when(settingsService.getSettings(USER_ID))
                .thenReturn(SettingsResponse.from(UserSettings.createWithDefaults(USER_ID)));

        mockMvc.perform(get("/api/settings"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.pomodoroSession.flowMin").value(25))
                .andExpect(jsonPath("$.pomodoroSession.cycleEvery").value(4))
                .andExpect(jsonPath("$.automation.autoStartBreak").value(false))
                .andExpect(jsonPath("$.miniDays.day1.label").value("오전"))
                .andExpect(jsonPath("$.miniDays.day1.start").value("06:00"))
                .andExpect(jsonPath("$.miniDays.day3.end").value("24:00"));
    }

    @Test
    @DisplayName("PUT /api/settings/pomodoro-session: flowMin=100 은 Bean Validation 400 + service 미호출")
    void updatePomodoro_flowMinBeyondMax_returnsValidationErrorWithoutServiceCall() throws Exception {
        PomodoroSessionSettingsRequest body = new PomodoroSessionSettingsRequest();
        body.setFlowMin(100);
        body.setBreakMin(5);
        body.setLongBreakMin(15);
        body.setCycleEvery(4);

        mockMvc.perform(put("/api/settings/pomodoro-session")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.error.fields.flowMin").exists());

        verify(settingsService, never()).updatePomodoro(any(), any());
    }

    @Test
    @DisplayName("PUT /api/settings/mini-days: start 형식 위반은 Bean Validation 400 + service 미호출")
    void updateMiniDays_invalidTimeFormat_returnsValidationErrorWithoutServiceCall() throws Exception {
        MiniDaysSettingsRequest body = new MiniDaysSettingsRequest();
        body.setDay1(dayRequest("오전", "25:00", "12:00"));
        body.setDay2(dayRequest("오후", "12:00", "18:00"));
        body.setDay3(dayRequest("저녁", "18:00", "24:00"));

        mockMvc.perform(put("/api/settings/mini-days")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));

        verify(settingsService, never()).updateMiniDays(any(), any());
    }

    private MiniDayRequest dayRequest(String label, String start, String end) {
        MiniDayRequest day = new MiniDayRequest();
        day.setLabel(label);
        day.setStart(start);
        day.setEnd(end);
        return day;
    }
}
