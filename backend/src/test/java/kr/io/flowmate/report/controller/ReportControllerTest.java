package kr.io.flowmate.report.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import kr.io.flowmate.common.util.CurrentUserResolver;
import kr.io.flowmate.common.web.CurrentUserArgumentResolver;
import kr.io.flowmate.common.web.GlobalExceptionHandler;
import kr.io.flowmate.report.domain.ReportType;
import kr.io.flowmate.report.dto.response.ReportResponse;
import kr.io.flowmate.report.exception.AiServiceQuotaExceededException;
import kr.io.flowmate.report.exception.AiServiceUnavailableException;
import kr.io.flowmate.report.exception.ReportRateLimitedException;
import kr.io.flowmate.report.exception.ReportGenerationInProgressException;
import kr.io.flowmate.report.service.ReportService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Map;
import java.util.Optional;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
@DisplayName("ReportController")
class ReportControllerTest {

    private static final String USER = "user-1";

    @Mock private ReportService reportService;
    @Mock private CurrentUserResolver currentUserResolver;
    @InjectMocks private ReportController controller;

    private MockMvc mockMvc;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(controller)
            .setControllerAdvice(new GlobalExceptionHandler())
            .setCustomArgumentResolvers(new CurrentUserArgumentResolver(currentUserResolver))
            .build();
        when(currentUserResolver.resolve()).thenReturn(USER);
    }

    @Test
    @DisplayName("POST /api/ai/report/generate — 200 OK + flattened body")
    void generate_ok() throws Exception {
        ReportResponse resp = new ReportResponse(
            "rep-1", "DAILY", LocalDate.parse("2026-05-28"),
            "- k", "- p", "- t", "정말요?", "daily.v2",
            Instant.parse("2026-05-28T10:00:00Z"));
        when(reportService.generate(eq(USER), eq(ReportType.DAILY), eq(LocalDate.parse("2026-05-28"))))
            .thenReturn(resp);

        String body = objectMapper.writeValueAsString(Map.of("type", "DAILY", "periodStart", "2026-05-28"));

        mockMvc.perform(post("/api/ai/report/generate")
                .contentType(MediaType.APPLICATION_JSON)
                .content(body))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value("rep-1"))
            .andExpect(jsonPath("$.keep").value("- k"))
            .andExpect(jsonPath("$.try").value("- t"))
            .andExpect(jsonPath("$.referenceQuestion").value("정말요?"))
            .andExpect(jsonPath("$.promptVersion").value("daily.v2"));
    }

    @Test
    @DisplayName("POST /api/ai/report/generate — todos 0개 → 400 BAD_REQUEST + 한국어 메시지")
    void generate_emptyData_400() throws Exception {
        when(reportService.generate(any(), any(), any()))
            .thenThrow(new IllegalArgumentException("생성할 데이터가 없습니다"));

        String body = objectMapper.writeValueAsString(Map.of("type", "DAILY", "periodStart", "2026-05-28"));

        mockMvc.perform(post("/api/ai/report/generate")
                .contentType(MediaType.APPLICATION_JSON)
                .content(body))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error.code").value("BAD_REQUEST"))
            .andExpect(jsonPath("$.error.message").value("생성할 데이터가 없습니다"));
    }

    @Test
    @DisplayName("POST /api/ai/report/generate — 같은 리포트 생성 중 → 409 REPORT_GENERATION_IN_PROGRESS")
    void generate_inProgress_409() throws Exception {
        when(reportService.generate(any(), any(), any())).thenThrow(new ReportGenerationInProgressException());

        mockMvc.perform(post("/api/ai/report/generate")
                .contentType(MediaType.APPLICATION_JSON)
                .content(dailyBody()))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.error.code").value("REPORT_GENERATION_IN_PROGRESS"));
    }

    @Test
    @DisplayName("POST /api/ai/report/generate — 자체 rate limit → 429 REPORT_RATE_LIMITED + Retry-After")
    void generate_rateLimited_429() throws Exception {
        when(reportService.generate(any(), any(), any()))
            .thenThrow(new ReportRateLimitedException(ReportRateLimitedException.Reason.COOLDOWN, 12));

        mockMvc.perform(post("/api/ai/report/generate")
                .contentType(MediaType.APPLICATION_JSON)
                .content(dailyBody()))
            .andExpect(status().isTooManyRequests())
            .andExpect(header().string("Retry-After", "12"))
            .andExpect(jsonPath("$.error.code").value("REPORT_RATE_LIMITED"))
            .andExpect(jsonPath("$.error.message").value("방금 만든 레포트예요. 12초 뒤에 다시 만들 수 있어요"));
    }

    @Test
    @DisplayName("POST /api/ai/report/generate — Gemini quota 초과 → 429 AI_QUOTA_EXCEEDED (자체 제한과 code가 다름)")
    void generate_upstreamQuota_429() throws Exception {
        when(reportService.generate(any(), any(), any())).thenThrow(new AiServiceQuotaExceededException());

        mockMvc.perform(post("/api/ai/report/generate")
                .contentType(MediaType.APPLICATION_JSON)
                .content(dailyBody()))
            .andExpect(status().isTooManyRequests())
            .andExpect(jsonPath("$.error.code").value("AI_QUOTA_EXCEEDED"));
    }

    @Test
    @DisplayName("POST /api/ai/report/generate — Gemini timeout → 503 AI_SERVICE_UNAVAILABLE")
    void generate_timeout_503() throws Exception {
        when(reportService.generate(any(), any(), any()))
            .thenThrow(new AiServiceUnavailableException(new java.net.SocketTimeoutException("Read timed out")));

        mockMvc.perform(post("/api/ai/report/generate")
                .contentType(MediaType.APPLICATION_JSON)
                .content(dailyBody()))
            .andExpect(status().isServiceUnavailable())
            .andExpect(jsonPath("$.error.code").value("AI_SERVICE_UNAVAILABLE"));
    }

    @Test
    @DisplayName("POST /api/ai/report/generate — type 잘못되면 400 BAD_REQUEST (Jackson 역직렬화 실패)")
    void generate_invalidType_400() throws Exception {
        String body = objectMapper.writeValueAsString(Map.of("type", "YEARLY", "periodStart", "2026-05-28"));

        mockMvc.perform(post("/api/ai/report/generate")
                .contentType(MediaType.APPLICATION_JSON)
                .content(body))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error.code").value("BAD_REQUEST"));
    }

    @Test
    @DisplayName("GET /api/ai/report — 존재하면 200 + body, referenceQuestion=null도 JSON에 null로 포함")
    void findOne_present_200() throws Exception {
        ReportResponse resp = new ReportResponse(
            "rep-1", "DAILY", LocalDate.parse("2026-05-28"),
            "- k", "- p", "- t", null, "daily.v2",
            Instant.parse("2026-05-28T10:00:00Z"));
        when(reportService.findOne(USER, ReportType.DAILY, LocalDate.parse("2026-05-28")))
            .thenReturn(Optional.of(resp));

        mockMvc.perform(get("/api/ai/report")
                .param("type", "DAILY").param("periodStart", "2026-05-28"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value("rep-1"))
            .andExpect(content().string(org.hamcrest.Matchers.containsString("\"referenceQuestion\":null")));
    }

    @Test
    @DisplayName("GET /api/ai/report — 없으면 204 No Content")
    void findOne_missing_204() throws Exception {
        when(reportService.findOne(any(), any(), any())).thenReturn(Optional.empty());

        mockMvc.perform(get("/api/ai/report")
                .param("type", "DAILY").param("periodStart", "2026-05-28"))
            .andExpect(status().isNoContent());
    }

    private String dailyBody() throws Exception {
        return objectMapper.writeValueAsString(Map.of("type", "DAILY", "periodStart", "2026-05-28"));
    }
}
