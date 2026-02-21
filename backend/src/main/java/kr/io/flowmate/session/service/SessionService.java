package kr.io.flowmate.session.service;

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

    @Transactional
    public List<SessionResponse> getSessions(String userId, String todoId) {
        Todo todo = findTodoByIdAndUserId(todoId, userId);
        reconcileTodoAggregate(todoId, todo);
        return sessionRepository.findAllByTodoIdOrderBySessionOrderAsc(todoId)
                .stream()
                .map(SessionResponse::from)
                .toList();
    }

    // 세션 생성 (멱등 처리)
    @Transactional
    public CreateSessionResult createSession(
            String userId,
            String todoId,
            SessionCreateRequest request
    ) {
        Integer requestedFocusSeconds = request.getSessionFocusSeconds();
        if (requestedFocusSeconds == null || requestedFocusSeconds <= 0) {
            throw new IllegalArgumentException("sessionFocusSeconds must be >= 1");
        }

        Todo todo = todoRepository.findByIdAndUserIdForUpdate(todoId, userId)
                .orElseThrow(() -> new TodoNotFoundException(todoId));
        reconcileTodoAggregate(todoId, todo);

        String clientSessionId = request.getClientSessionId().trim();

        TodoSession existing = sessionRepository
                .findByTodoIdAndClientSessionId(todoId, clientSessionId)
                .orElse(null);

        if (existing != null) {
            if (existing.getSessionFocusSeconds() != requestedFocusSeconds) {
                throw new IllegalArgumentException(
                        "idempotency conflict: sessionFocusSeconds mismatch for clientSessionId=" + clientSessionId
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

    private Todo findTodoByIdAndUserId(String todoId, String userId) {
        return todoRepository.findByIdAndUserId(todoId, userId)
                .orElseThrow(() -> new TodoNotFoundException(todoId));
    }

    private void reconcileTodoAggregate(String todoId, Todo todo) {
        TodoSessionRepository.SessionAggregate aggregate = sessionRepository.summarizeByTodoId(todoId);
        if (aggregate == null) {
            return;
        }

        int sessionCount = Math.toIntExact(aggregate.getSessionCount());
        int sessionFocusSeconds = Math.toIntExact(aggregate.getSessionFocusSeconds());

        if (todo.getSessionCount() == sessionCount && todo.getSessionFocusSeconds() == sessionFocusSeconds) {
            return;
        }

        todo.syncSessionAggregate(sessionCount, sessionFocusSeconds);
    }

    public record CreateSessionResult(SessionResponse session, boolean created) {
    }

}
