package kr.io.flowmate.session.controller;

import jakarta.validation.Valid;
import kr.io.flowmate.common.dto.ListResponse;
import kr.io.flowmate.common.web.CurrentUser;
import kr.io.flowmate.session.dto.request.SessionCreateRequest;
import kr.io.flowmate.session.dto.response.SessionResponse;
import kr.io.flowmate.session.service.SessionService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/todos/{todoId}/sessions")
@RequiredArgsConstructor
public class SessionController {

    private final SessionService sessionService;

    @GetMapping
    public ResponseEntity<ListResponse<SessionResponse>> getSessions(
            @CurrentUser String userId,
            @PathVariable String todoId
    ) {
        List<SessionResponse> sessions = sessionService.getSessions(userId, todoId);
        return ResponseEntity.ok(new ListResponse<>(sessions));
    }

    @PostMapping
    public ResponseEntity<SessionResponse> createSession(
            @CurrentUser String userId,
            @PathVariable String todoId,
            @Valid @RequestBody SessionCreateRequest createRequest
    ) {
        SessionService.CreateSessionResult result = sessionService.createSession(userId, todoId, createRequest);
        HttpStatus status = result.created() ? HttpStatus.CREATED : HttpStatus.OK;
        return ResponseEntity.status(status).body(result.session());
    }
}
