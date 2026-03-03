package kr.io.flowmate.timer.controller;

import jakarta.validation.Valid;
import kr.io.flowmate.auth.jwt.JwtProvider;
import kr.io.flowmate.common.util.CurrentUserResolver;
import kr.io.flowmate.timer.dto.TimerStatePushRequest;
import kr.io.flowmate.timer.dto.TimerStateResponse;
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

    private final JwtProvider jwtProvider;
    private final SseEmitterRegistry sseEmitterRegistry;
    private final TimerService timerService;
    private final CurrentUserResolver currentUserResolver;

    @GetMapping(value = "/sse", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter subscribe(@RequestParam String token) {
        // query param으로 받은 access token이 유효한지 직접 검사
        if (!jwtProvider.validateToken(token)) {
            throw new IllegalArgumentException("유효하지 않은 토큰입니다.");
        }

        // member 전용 엔드포인트인지 확인
        if (!"member".equals(jwtProvider.extractRole(token))) {
            throw new IllegalArgumentException("member 전용 엔드포인트입니다.");
        }

        // 토큰에서 userId(subject) 추출한 후, 이 userId로 SSE 연결을 registry에 등록하고 emitter 반환
        String userId = jwtProvider.extractSubject(token);
        return sseEmitterRegistry.register(userId);
    }

    // 타이머 상태를 서버에 저장하는 엔드포인트
    @PutMapping("/state/{todoId}")
    public ResponseEntity<TimerStateResponse> pushState(
            @PathVariable String todoId,
            @Valid @RequestBody TimerStatePushRequest request
    ) {
        // 현재 로그인 사용자(userId) 추출
        String userId = currentUserResolver.resolve();

        // 실제 저장/버전 증가/soft delete/SSE broadcast는 서비스에 맡긴다.
        return ResponseEntity.ok(timerService.upsertState(userId, todoId, request));
    }

    //  앱 시작 시 현재 진행 중인 타이머 상태를 복원하기 위한 엔드포인트
    @GetMapping("/state")
    public ResponseEntity<List<TimerStateResponse>> getActiveStates() {
        // 현재 로그인 사용자(userId) 추출
        String userId = currentUserResolver.resolve();

        // 서비스에서 active state만 조회해서 반환
        return ResponseEntity.ok(timerService.getActiveStates(userId));
    }

}
