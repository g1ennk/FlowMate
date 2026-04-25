package kr.io.flowmate.timer.controller;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import kr.io.flowmate.auth.jwt.JwtProvider;
import kr.io.flowmate.common.exception.AuthenticationFailedException;
import kr.io.flowmate.common.util.CurrentUserResolver;
import kr.io.flowmate.common.web.CurrentUserArgumentResolver;
import kr.io.flowmate.common.web.GlobalExceptionHandler;
import kr.io.flowmate.timer.dto.response.TimerStateResponse;
import kr.io.flowmate.timer.service.SseEmitterRegistry;
import kr.io.flowmate.timer.service.TimerService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
@DisplayName("TimerController")
class TimerControllerTest {

    @Mock private JwtProvider jwtProvider;
    @Mock private SseEmitterRegistry sseEmitterRegistry;
    @Mock private TimerService timerService;
    @Mock private CurrentUserResolver currentUserResolver;

    @InjectMocks private TimerController timerController;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(timerController)
                .setControllerAdvice(new GlobalExceptionHandler())
                .setCustomArgumentResolvers(new CurrentUserArgumentResolver(currentUserResolver))
                .build();
    }

    @Test
    @DisplayName("subscribe: member 역할 + 유효한 토큰이면 SseEmitterRegistry 에 subject(userId) 로 등록한다")
    void subscribe_validMemberToken_registersWithSubject() {
        Claims claims = mock(Claims.class);
        when(jwtProvider.parseToken("valid-member-token")).thenReturn(claims);
        when(claims.get("role", String.class)).thenReturn("member");
        when(claims.getSubject()).thenReturn("user-1");
        SseEmitter emitter = new SseEmitter();
        when(sseEmitterRegistry.register("user-1")).thenReturn(emitter);

        SseEmitter result = timerController.subscribe("valid-member-token");

        assertThat(result).isSameAs(emitter);
        verify(sseEmitterRegistry).register("user-1");
    }

    @Test
    @DisplayName("subscribe: parseToken 이 JwtException 을 던지면 AuthenticationFailedException (401) 으로 감싼다")
    void subscribe_invalidSignature_throwsAuthFailed() {
        when(jwtProvider.parseToken("broken")).thenThrow(new JwtException("bad signature"));

        assertThatThrownBy(() -> timerController.subscribe("broken"))
                .isInstanceOf(AuthenticationFailedException.class)
                .hasMessageContaining("유효하지 않은 토큰");
        verify(sseEmitterRegistry, never()).register(anyString());
    }

    @Test
    @DisplayName("subscribe: role != member 이면 AuthenticationFailedException (401, 게스트 토큰 차단)")
    void subscribe_nonMemberRole_throwsAuthFailed() {
        Claims claims = mock(Claims.class);
        when(jwtProvider.parseToken("guest-token")).thenReturn(claims);
        when(claims.get("role", String.class)).thenReturn("guest");

        assertThatThrownBy(() -> timerController.subscribe("guest-token"))
                .isInstanceOf(AuthenticationFailedException.class)
                .hasMessageContaining("member 전용");
        verify(sseEmitterRegistry, never()).register(anyString());
    }

    @Test
    @DisplayName("subscribe MockMvc: 잘못된 토큰은 401 AUTHENTICATION_FAILED JSON 응답 (기존 400 → 401)")
    void subscribe_invalidToken_returns401ViaMockMvc() throws Exception {
        when(jwtProvider.parseToken("bad-jwt")).thenThrow(new JwtException("bad signature"));

        mockMvc.perform(get("/api/timer/sse?token=bad-jwt"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error.code").value("AUTHENTICATION_FAILED"));
    }

    @Test
    @DisplayName("pushState: 요청 본문을 service 에 위임하고 200 + TimerStateResponse JSON 반환")
    void pushState_delegatesToService_returns200() throws Exception {
        String todoId = "todo-abc";
        when(currentUserResolver.resolve()).thenReturn("user-1");
        when(timerService.upsertState(eq("user-1"), eq(todoId), any()))
                .thenReturn(new TimerStateResponse(todoId, "state-payload", 999L));

        mockMvc.perform(put("/api/timer/state/{todoId}", todoId)
                        .contentType("application/json")
                        .content("""
                                {"status":"running","state":{"mode":"pomodoro"}}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.todoId").value(todoId))
                .andExpect(jsonPath("$.version").value(999));
    }

    @Test
    @DisplayName("getActiveStates: service 가 반환한 list 를 그대로 200 으로 내린다")
    void getActiveStates_returnsServiceList() throws Exception {
        when(currentUserResolver.resolve()).thenReturn("user-1");
        when(timerService.getActiveStates("user-1"))
                .thenReturn(List.of(new TimerStateResponse("todo-1", "state-1", 111L)));

        mockMvc.perform(get("/api/timer/state"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].todoId").value("todo-1"))
                .andExpect(jsonPath("$[0].version").value(111));
    }
}
