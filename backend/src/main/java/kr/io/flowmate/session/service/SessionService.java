package kr.io.flowmate.session.service;

import kr.io.flowmate.common.exception.IdempotencyConflictException;
import kr.io.flowmate.session.domain.TodoSession;
import kr.io.flowmate.session.dto.request.SessionCreateRequest;
import kr.io.flowmate.session.dto.response.SessionResponse;
import kr.io.flowmate.session.repository.TodoSessionRepository;
import kr.io.flowmate.todo.domain.Todo;
import kr.io.flowmate.todo.exception.TodoNotFoundException;
import kr.io.flowmate.todo.repository.TodoRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class SessionService {

    private final TodoSessionRepository sessionRepository;
    private final TodoRepository todoRepository;

    public List<SessionResponse> getSessions(String userId, String todoId) {
        todoRepository.findByIdAndUserId(todoId, userId)
                .orElseThrow(() -> new TodoNotFoundException(todoId));
        return sessionRepository.findAllByTodoIdOrderBySessionOrderAsc(todoId)
                .stream()
                .map(SessionResponse::from)
                .toList();
    }

    // Todo 행 PESSIMISTIC_WRITE + 멱등 조회 + 세션 insert + Todo 집계 갱신을
    // 하나의 트랜잭션으로 묶어 원자성을 보장한다. DB uniq (todo_id, client_session_id) 가 최후 방어선.
    // 세션 삭제 API 를 추가하게 되면 집계 감소 경로 + reconcile 재도입 검토가 필요하다.
    @Transactional
    public CreateSessionResult createSession(
            String userId,
            String todoId,
            SessionCreateRequest request
    ) {
        int requestedFocusSeconds = request.getSessionFocusSeconds();

        Todo todo = todoRepository.findByIdAndUserIdForUpdate(todoId, userId)
                .orElseThrow(() -> new TodoNotFoundException(todoId));

        String clientSessionId = request.getClientSessionId();

        TodoSession existing = sessionRepository
                .findByTodoIdAndClientSessionId(todoId, clientSessionId)
                .orElse(null);

        if (existing != null) {
            if (existing.getSessionFocusSeconds() != requestedFocusSeconds) {
                throw new IdempotencyConflictException(
                        "sessionFocusSeconds mismatch for clientSessionId=" + clientSessionId
                );
            }
            existing.increaseBreakSecondsIfGreater(request.getBreakSecondsOrDefault());
            return new CreateSessionResult(SessionResponse.from(existing), false);
        }

        int nextOrder = sessionRepository
                .findTopByTodoIdOrderBySessionOrderDesc(todoId)
                .map(session -> session.getSessionOrder() + 1)
                .orElse(1);

        TodoSession session = TodoSession.create(
                userId,
                todoId,
                clientSessionId,
                requestedFocusSeconds,
                request.getBreakSecondsOrDefault(),
                nextOrder
        );

        todo.incrementSessionCount();
        todo.addSessionFocusSeconds(requestedFocusSeconds);

        TodoSession saved = sessionRepository.save(session);

        return new CreateSessionResult(SessionResponse.from(saved), true);
    }

    public record CreateSessionResult(SessionResponse session, boolean created) {
    }

}
