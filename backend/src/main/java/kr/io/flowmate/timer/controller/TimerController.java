package kr.io.flowmate.timer.controller;

import jakarta.validation.Valid;
import kr.io.flowmate.auth.jwt.JwtProvider;
import kr.io.flowmate.common.web.CurrentUser;
import kr.io.flowmate.timer.dto.request.TimerStatePushRequest;
import kr.io.flowmate.timer.dto.response.TimerStateResponse;
import kr.io.flowmate.timer.service.SseEmitterRegistry;
import kr.io.flowmate.timer.service.TimerService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
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

    @GetMapping(value = "/sse", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public ResponseEntity<?> subscribe(@RequestParam String token) {
        return jwtProvider.parseClaims(token)
                .filter(c -> "member".equals(c.get("role", String.class)))
                .<ResponseEntity<?>>map(claims -> ResponseEntity.ok(
                        sseEmitterRegistry.register(claims.getSubject())))
                .orElse(ResponseEntity.status(HttpStatus.UNAUTHORIZED).build());
    }

    @PutMapping("/state/{todoId}")
    public ResponseEntity<TimerStateResponse> pushState(
            @CurrentUser String userId,
            @PathVariable String todoId,
            @Valid @RequestBody TimerStatePushRequest request
    ) {
        return ResponseEntity.ok(timerService.upsertState(userId, todoId, request));
    }

    @GetMapping("/state")
    public ResponseEntity<List<TimerStateResponse>> getActiveStates(@CurrentUser String userId) {
        return ResponseEntity.ok(timerService.getActiveStates(userId));
    }
}
