package kr.io.flowmate.session.controller;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import kr.io.flowmate.common.dto.ListResponse;
//import kr.io.flowmate.common.util.ClientIdResolver;
import kr.io.flowmate.common.util.CurrentUserResolver;
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
    private final CurrentUserResolver currentUserResolver;

    @GetMapping
    public ResponseEntity<ListResponse<SessionResponse>> getSessions(
            HttpServletRequest request,
            @PathVariable String todoId
    ) {
        String userId = currentUserResolver.resolve();
        List<SessionResponse> sessions = sessionService.getSessions(userId, todoId);
        return ResponseEntity.ok(new ListResponse<>(sessions));
    }

    @PostMapping
    public ResponseEntity<SessionResponse> createSession(
            HttpServletRequest request,
            @PathVariable String todoId,
            @Valid @RequestBody SessionCreateRequest createRequest
    ) {
        String userId = currentUserResolver.resolve();
        SessionService.CreateSessionResult result = sessionService.createSession(userId, todoId, createRequest);
        HttpStatus status = result.created() ? HttpStatus.CREATED : HttpStatus.OK;
        return ResponseEntity.status(status).body(result.session());
    }

}
