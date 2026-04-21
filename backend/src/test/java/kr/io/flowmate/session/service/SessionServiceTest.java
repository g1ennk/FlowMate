package kr.io.flowmate.session.service;

import kr.io.flowmate.session.domain.TodoSession;
import kr.io.flowmate.session.dto.request.SessionCreateRequest;
import kr.io.flowmate.session.dto.response.SessionResponse;
import kr.io.flowmate.session.repository.TodoSessionRepository;
import kr.io.flowmate.todo.domain.Todo;
import kr.io.flowmate.todo.exception.TodoNotFoundException;
import kr.io.flowmate.todo.repository.TodoRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@DisplayName("SessionService")
class SessionServiceTest {

    private static final String USER_ID = "11111111-1111-4111-8111-111111111111";
    private static final String TODO_ID = "22222222-2222-4222-8222-222222222222";
    private static final String CLIENT_SESSION_ID = "33333333-3333-4333-8333-333333333333";
    private static final String OTHER_CLIENT_SESSION_ID = "44444444-4444-4444-8444-444444444444";

    @Mock private TodoSessionRepository sessionRepository;
    @Mock private TodoRepository todoRepository;

    @InjectMocks private SessionService sessionService;

    @Test
    @DisplayName("createSession: 신규 생성 시 저장 + Todo 집계 증가")
    void createSession_newSession_incrementsAggregateAndSaves() {
        Todo todo = newTodo();
        SessionCreateRequest request = request(1500, 300, CLIENT_SESSION_ID);

        when(todoRepository.findByIdAndUserIdForUpdate(TODO_ID, USER_ID)).thenReturn(Optional.of(todo));
        when(sessionRepository.findByTodoIdAndClientSessionId(TODO_ID, CLIENT_SESSION_ID)).thenReturn(Optional.empty());
        when(sessionRepository.findTopByTodoIdOrderBySessionOrderDesc(TODO_ID)).thenReturn(Optional.empty());
        when(sessionRepository.save(any(TodoSession.class))).thenAnswer(inv -> inv.getArgument(0));

        SessionService.CreateSessionResult result = sessionService.createSession(USER_ID, TODO_ID, request);

        assertThat(result.created()).isTrue();
        SessionResponse response = result.session();
        assertThat(response.todoId()).isEqualTo(TODO_ID);
        assertThat(response.sessionFocusSeconds()).isEqualTo(1500);
        assertThat(response.breakSeconds()).isEqualTo(300);
        assertThat(response.sessionOrder()).isEqualTo(1);

        assertThat(todo.getSessionCount()).isEqualTo(1);
        assertThat(todo.getSessionFocusSeconds()).isEqualTo(1500);

        verify(sessionRepository).save(any(TodoSession.class));
    }

    @Test
    @DisplayName("createSession: 동일 clientSessionId 재요청은 기존 반환 + save 미호출")
    void createSession_idempotentReplay_returnsExistingWithoutSave() {
        Todo todo = newTodo();
        TodoSession existing = TodoSession.create(USER_ID, TODO_ID, CLIENT_SESSION_ID, 1200, 120, 2);
        SessionCreateRequest request = request(1200, 120, CLIENT_SESSION_ID);

        when(todoRepository.findByIdAndUserIdForUpdate(TODO_ID, USER_ID)).thenReturn(Optional.of(todo));
        when(sessionRepository.findByTodoIdAndClientSessionId(TODO_ID, CLIENT_SESSION_ID)).thenReturn(Optional.of(existing));

        SessionService.CreateSessionResult result = sessionService.createSession(USER_ID, TODO_ID, request);

        assertThat(result.created()).isFalse();
        assertThat(result.session().sessionOrder()).isEqualTo(2);
        verify(sessionRepository, never()).save(any(TodoSession.class));
        verify(sessionRepository, never()).findTopByTodoIdOrderBySessionOrderDesc(any());
    }

    @Test
    @DisplayName("createSession: 동일 clientSessionId + sessionFocusSeconds 불일치면 멱등 충돌")
    void createSession_focusMismatchOnReplay_throws() {
        Todo todo = newTodo();
        TodoSession existing = TodoSession.create(USER_ID, TODO_ID, CLIENT_SESSION_ID, 1200, 120, 2);
        SessionCreateRequest request = request(900, 120, CLIENT_SESSION_ID);

        when(todoRepository.findByIdAndUserIdForUpdate(TODO_ID, USER_ID)).thenReturn(Optional.of(todo));
        when(sessionRepository.findByTodoIdAndClientSessionId(TODO_ID, CLIENT_SESSION_ID)).thenReturn(Optional.of(existing));

        assertThatThrownBy(() -> sessionService.createSession(USER_ID, TODO_ID, request))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("idempotency conflict");

        assertThat(todo.getSessionCount()).isZero();
        assertThat(todo.getSessionFocusSeconds()).isZero();
        verify(sessionRepository, never()).save(any(TodoSession.class));
        verify(sessionRepository, never()).findTopByTodoIdOrderBySessionOrderDesc(any());
    }

    @Test
    @DisplayName("createSession: sessionOrder = 직전 max + 1 로 자동 증가")
    void createSession_autoAssignsNextSessionOrder() {
        Todo todo = newTodo();
        TodoSession last = TodoSession.create(USER_ID, TODO_ID, OTHER_CLIENT_SESSION_ID, 1000, 0, 3);
        SessionCreateRequest request = request(1800, 60, CLIENT_SESSION_ID);

        when(todoRepository.findByIdAndUserIdForUpdate(TODO_ID, USER_ID)).thenReturn(Optional.of(todo));
        when(sessionRepository.findByTodoIdAndClientSessionId(TODO_ID, CLIENT_SESSION_ID)).thenReturn(Optional.empty());
        when(sessionRepository.findTopByTodoIdOrderBySessionOrderDesc(TODO_ID)).thenReturn(Optional.of(last));
        when(sessionRepository.save(any(TodoSession.class))).thenAnswer(inv -> inv.getArgument(0));

        SessionService.CreateSessionResult result = sessionService.createSession(USER_ID, TODO_ID, request);

        assertThat(result.session().sessionOrder()).isEqualTo(4);
    }

    @Test
    @DisplayName("createSession: 멱등 재요청에서 breakSeconds는 증가 방향으로만 반영(max-seal)")
    void createSession_replay_maxSealsBreakSeconds() {
        Todo todo = newTodo();
        TodoSession existing = TodoSession.create(USER_ID, TODO_ID, CLIENT_SESSION_ID, 1200, 120, 2);

        when(todoRepository.findByIdAndUserIdForUpdate(TODO_ID, USER_ID)).thenReturn(Optional.of(todo));
        when(sessionRepository.findByTodoIdAndClientSessionId(TODO_ID, CLIENT_SESSION_ID)).thenReturn(Optional.of(existing));

        // 1) 기존보다 큰 값 → 반영
        SessionService.CreateSessionResult increased = sessionService.createSession(USER_ID, TODO_ID, request(1200, 300, CLIENT_SESSION_ID));
        assertThat(increased.session().breakSeconds()).isEqualTo(300);
        assertThat(existing.getBreakSeconds()).isEqualTo(300);

        // 2) 기존보다 작은 값 → 무시
        SessionService.CreateSessionResult decreased = sessionService.createSession(USER_ID, TODO_ID, request(1200, 120, CLIENT_SESSION_ID));
        assertThat(decreased.session().breakSeconds()).isEqualTo(300);
        assertThat(existing.getBreakSeconds()).isEqualTo(300);

        verify(sessionRepository, never()).save(any(TodoSession.class));
    }

    @Test
    @DisplayName("createSession: Todo 미존재 시 TodoNotFoundException")
    void createSession_todoNotFound_throws() {
        SessionCreateRequest request = request(1500, 0, CLIENT_SESSION_ID);
        when(todoRepository.findByIdAndUserIdForUpdate(TODO_ID, USER_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> sessionService.createSession(USER_ID, TODO_ID, request))
                .isInstanceOf(TodoNotFoundException.class)
                .hasMessageContaining(TODO_ID);
    }

    @Test
    @DisplayName("getSessions: sessionOrder ASC 순서로 반환")
    void getSessions_returnsInSessionOrderAsc() {
        Todo todo = newTodo();
        List<TodoSession> sessions = List.of(
                TodoSession.create(USER_ID, TODO_ID, CLIENT_SESSION_ID, 1200, 0, 1),
                TodoSession.create(USER_ID, TODO_ID, OTHER_CLIENT_SESSION_ID, 900, 300, 2)
        );

        when(todoRepository.findByIdAndUserId(TODO_ID, USER_ID)).thenReturn(Optional.of(todo));
        when(sessionRepository.findAllByTodoIdOrderBySessionOrderAsc(TODO_ID)).thenReturn(sessions);

        List<SessionResponse> result = sessionService.getSessions(USER_ID, TODO_ID);

        assertThat(result).hasSize(2);
        assertThat(result.get(0).sessionOrder()).isEqualTo(1);
        assertThat(result.get(1).sessionOrder()).isEqualTo(2);
    }

    private Todo newTodo() {
        return Todo.create(USER_ID, "집중", null, LocalDate.of(2026, 2, 13), 0, 0);
    }

    private SessionCreateRequest request(int focus, int rest, String clientSessionId) {
        SessionCreateRequest request = new SessionCreateRequest();
        request.setSessionFocusSeconds(focus);
        request.setBreakSeconds(rest);
        request.setClientSessionId(clientSessionId);
        return request;
    }
}
