package kr.io.flowmate.common.web;

import kr.io.flowmate.common.exception.NotFoundException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.*;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@DisplayName("GlobalExceptionHandler")
class GlobalExceptionHandlerTest {

    private MockMvc mockMvc;

    // 테스트 전용 컨트롤러 — 각 예외를 의도적으로 발생시킴
    @RestController
    @RequestMapping("/test")
    static class TestController {
        @GetMapping("/not-found")
        void notFound() { throw new NotFoundException("Todo not found"); }

        @GetMapping("/bad-request")
        void badRequest() { throw new IllegalArgumentException("잘못된 입력"); }

        @PostMapping("/validation")
        void validation(@RequestBody @jakarta.validation.Valid ValidationRequest req) {}

        record ValidationRequest(@jakarta.validation.constraints.NotBlank String title) {}
    }

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders
                .standaloneSetup(new TestController())
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    @DisplayName("NotFoundException → 404 + NOT_FOUND 코드")
    void notFound_returns404WithNotFoundCode() throws Exception {
        mockMvc.perform(get("/test/not-found"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("NOT_FOUND"))
                .andExpect(jsonPath("$.error.message").value("Todo not found"));
    }

    @Test
    @DisplayName("IllegalArgumentException → 400 + BAD_REQUEST 코드")
    void illegalArgument_returns400WithBadRequestCode() throws Exception {
        mockMvc.perform(get("/test/bad-request"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("BAD_REQUEST"))
                .andExpect(jsonPath("$.error.message").value("잘못된 입력"));
    }

    @Test
    @DisplayName("@Valid 실패 → 400 + VALIDATION_ERROR + fields 맵")
    void validationFailure_returns400WithFieldsMap() throws Exception {
        mockMvc.perform(post("/test/validation")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\": \"\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.error.fields.title").exists());
    }

    @Test
    @DisplayName("@Valid 실패 — null body → 400")
    void validationFailure_nullBody_returns400() throws Exception {
        mockMvc.perform(post("/test/validation")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
    }

    @Test
    @DisplayName("ApiError JSON 구조: error.code, error.message 필드 존재")
    void apiError_jsonStructure_hasErrorCodeAndMessage() throws Exception {
        mockMvc.perform(get("/test/not-found"))
                .andExpect(jsonPath("$.error").exists())
                .andExpect(jsonPath("$.error.code").isString())
                .andExpect(jsonPath("$.error.message").isString());
    }
}
