package kr.io.flowmate.session.controller;

import kr.io.flowmate.common.util.CurrentUserResolver;
import kr.io.flowmate.common.web.GlobalExceptionHandler;
import kr.io.flowmate.session.dto.response.SessionResponse;
import kr.io.flowmate.session.service.SessionService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.time.Instant;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
@DisplayName("SessionController")
class SessionControllerTest {

    @Mock private SessionService sessionService;
    @Mock private CurrentUserResolver currentUserResolver;

    @InjectMocks private SessionController sessionController;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(sessionController)
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    @DisplayName("createSession: created=true 신규는 201 Created")
    void createSession_created_returns201() throws Exception {
        String todoId = UUID.randomUUID().toString();
        String clientSessionId = UUID.randomUUID().toString();
        when(currentUserResolver.resolve()).thenReturn("user-1");
        when(sessionService.createSession(eq("user-1"), eq(todoId), any()))
                .thenReturn(new SessionService.CreateSessionResult(sampleResponse(todoId), true));

        mockMvc.perform(post("/api/todos/{todoId}/sessions", todoId)
                        .contentType("application/json")
                        .content("""
                                {"sessionFocusSeconds":1500,"breakSeconds":300,"clientSessionId":"%s"}
                                """.formatted(clientSessionId)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.todoId").value(todoId))
                .andExpect(jsonPath("$.sessionFocusSeconds").value(1500));
    }

    @Test
    @DisplayName("createSession: created=false 멱등 재요청은 200 OK")
    void createSession_idempotentReplay_returns200() throws Exception {
        String todoId = UUID.randomUUID().toString();
        String clientSessionId = UUID.randomUUID().toString();
        when(currentUserResolver.resolve()).thenReturn("user-1");
        when(sessionService.createSession(eq("user-1"), eq(todoId), any()))
                .thenReturn(new SessionService.CreateSessionResult(sampleResponse(todoId), false));

        mockMvc.perform(post("/api/todos/{todoId}/sessions", todoId)
                        .contentType("application/json")
                        .content("""
                                {"sessionFocusSeconds":1500,"breakSeconds":300,"clientSessionId":"%s"}
                                """.formatted(clientSessionId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.todoId").value(todoId));
    }

    private SessionResponse sampleResponse(String todoId) {
        return new SessionResponse(
                UUID.randomUUID().toString(),
                todoId,
                1500,
                300,
                1,
                Instant.parse("2026-04-01T00:00:00Z")
        );
    }
}
