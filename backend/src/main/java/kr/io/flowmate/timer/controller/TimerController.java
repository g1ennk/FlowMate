package kr.io.flowmate.timer.controller;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import jakarta.validation.Valid;
import kr.io.flowmate.auth.jwt.JwtProvider;
import kr.io.flowmate.common.annotation.CurrentUser;
import kr.io.flowmate.common.exception.AuthenticationFailedException;
import kr.io.flowmate.timer.dto.request.TimerStatePushRequest;
import kr.io.flowmate.timer.dto.response.TimerStateResponse;
import kr.io.flowmate.timer.service.SseEmitterRegistry;
import kr.io.flowmate.timer.service.TimerService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;

@RestController
@RequestMapping("/api/timer")
@RequiredArgsConstructor
public class TimerController {

    private static final String MEMBER_ROLE = "member";

    private final JwtProvider jwtProvider;
    private final SseEmitterRegistry sseEmitterRegistry;
    private final TimerService timerService;

    @GetMapping(value = "/sse", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter subscribe(@RequestParam String token) {
        // SSE 는 EventSource 제약 때문에 쿼리 파라미터로 토큰을 받는다 (Authorization 헤더 사용 불가).
        // JwtAuthFilter 가 처리하지 않는 경로라 컨트롤러에서 직접 서명·만료·역할을 검증한다.
        // 단일 parseToken 으로 role/subject 를 한 번에 꺼내 만료 경계 race 와 중복 서명 검증을 막는다.
        Claims claims;
        try {
            claims = jwtProvider.parseToken(token);
        } catch (JwtException | IllegalArgumentException e) {
            throw new AuthenticationFailedException("유효하지 않은 토큰입니다.");
        }

        if (!MEMBER_ROLE.equals(claims.get("role", String.class))) {
            throw new AuthenticationFailedException("member 전용 엔드포인트입니다.");
        }

        return sseEmitterRegistry.register(claims.getSubject());
    }

    // 타이머 상태를 서버에 저장하는 엔드포인트
    @PutMapping("/state/{todoId}")
    public ResponseEntity<TimerStateResponse> pushState(
            @CurrentUser String userId,
            @PathVariable String todoId,
            @Valid @RequestBody TimerStatePushRequest request
    ) {
        // 실제 저장/버전 증가/soft delete/SSE broadcast는 서비스에 맡긴다.
        return ResponseEntity.ok(timerService.upsertState(userId, todoId, request));
    }

    //  앱 시작 시 현재 진행 중인 타이머 상태를 복원하기 위한 엔드포인트
    @GetMapping("/state")
    public ResponseEntity<List<TimerStateResponse>> getActiveStates(@CurrentUser String userId) {
        // 서비스에서 active state만 조회해서 반환
        return ResponseEntity.ok(timerService.getActiveStates(userId));
    }

}
