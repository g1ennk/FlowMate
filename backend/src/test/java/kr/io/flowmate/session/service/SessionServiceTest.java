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
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("SessionServiceTest")
class SessionServiceTest {

    @Mock
    private TodoSessionRepository sessionRepository;

    @Mock
    private TodoRepository todoRepository;

    @InjectMocks
    private SessionService sessionService;

    @Test
    @DisplayName("createSession: 신규 생성 시 저장 + Todo 집계 증가")
    void createSession_신규생성_집계증가() {
        // given
        String userId = "11111111-1111-4111-8111-111111111111";
        String todoId = "22222222-2222-4222-8222-222222222222";
        String clientSessionId = "33333333-3333-4333-8333-333333333333";

        Todo todo = Todo.create(userId, "집중", null, LocalDate.of(2026, 2, 13), 0, 0);
        SessionCreateRequest request = request(1500, 300, clientSessionId);

        when(todoRepository.findByIdAndUserIdForUpdate(todoId, userId)).thenReturn(Optional.of(todo));
        when(sessionRepository.summarizeByTodoId(todoId)).thenReturn(aggregate(0, 0));
        when(sessionRepository.findByTodoIdAndClientSessionId(todoId, clientSessionId)).thenReturn(Optional.empty());
        when(sessionRepository.findTopByTodoIdOrderBySessionOrderDesc(todoId)).thenReturn(Optional.empty());
        when(sessionRepository.save(any(TodoSession.class))).thenAnswer(invocation -> invocation.getArgument(0));

        // when
        SessionService.CreateSessionResult result = sessionService.createSession(userId, todoId, request);

        // then
        assertThat(result.created()).isTrue();
        SessionResponse response = result.session();
        assertThat(response.getTodoId()).isEqualTo(todoId);
        assertThat(response.getSessionFocusSeconds()).isEqualTo(1500);
        assertThat(response.getBreakSeconds()).isEqualTo(300);
        assertThat(response.getSessionOrder()).isEqualTo(1);

        assertThat(todo.getSessionCount()).isEqualTo(1);
        assertThat(todo.getSessionFocusSeconds()).isEqualTo(1500);

        verify(sessionRepository).save(any(TodoSession.class));
    }

    @Test
    @DisplayName("createSession: 동일 clientSessionId 재요청은 멱등 처리")
    void createSession_동일키재요청_멱등처리() {
        // given
        String userId = "11111111-1111-4111-8111-111111111111";
        String todoId = "22222222-2222-4222-8222-222222222222";
        String clientSessionId = "33333333-3333-4333-8333-333333333333";

        Todo todo = Todo.create(userId, "집중", null, LocalDate.of(2026, 2, 13), 0, 0);
        TodoSession existing = TodoSession.create(userId, todoId, clientSessionId, 1200, 120, 2);
        SessionCreateRequest request = request(1200, 120, clientSessionId);

        when(todoRepository.findByIdAndUserIdForUpdate(todoId, userId)).thenReturn(Optional.of(todo));
        when(sessionRepository.summarizeByTodoId(todoId)).thenReturn(aggregate(0, 0));
        when(sessionRepository.findByTodoIdAndClientSessionId(todoId, clientSessionId)).thenReturn(Optional.of(existing));

        // when
        SessionService.CreateSessionResult result = sessionService.createSession(userId, todoId, request);

        // then
        assertThat(result.created()).isFalse();
        assertThat(result.session().getSessionOrder()).isEqualTo(2);

        assertThat(todo.getSessionCount()).isEqualTo(0);
        assertThat(todo.getSessionFocusSeconds()).isEqualTo(0);

        verify(sessionRepository, never()).save(any(TodoSession.class));
        verify(sessionRepository, never()).findTopByTodoIdOrderBySessionOrderDesc(any());
    }

    @Test
    @DisplayName("createSession: 동일 clientSessionId 재요청에서 sessionFocusSeconds 불일치면 예외")
    void createSession_동일키재요청_focusSeconds불일치_예외() {
        // given
        String userId = "11111111-1111-4111-8111-111111111111";
        String todoId = "22222222-2222-4222-8222-222222222222";
        String clientSessionId = "33333333-3333-4333-8333-333333333333";

        Todo todo = Todo.create(userId, "집중", null, LocalDate.of(2026, 2, 13), 0, 0);
        TodoSession existing = TodoSession.create(userId, todoId, clientSessionId, 1200, 120, 2);
        SessionCreateRequest request = request(900, 120, clientSessionId);

        when(todoRepository.findByIdAndUserIdForUpdate(todoId, userId)).thenReturn(Optional.of(todo));
        when(sessionRepository.summarizeByTodoId(todoId)).thenReturn(aggregate(1, 1200));
        when(sessionRepository.findByTodoIdAndClientSessionId(todoId, clientSessionId)).thenReturn(Optional.of(existing));

        // when / then
        assertThatThrownBy(() -> sessionService.createSession(userId, todoId, request))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("idempotency conflict");

        verify(sessionRepository, never()).save(any(TodoSession.class));
        verify(sessionRepository, never()).findTopByTodoIdOrderBySessionOrderDesc(any());
    }

    @Test
    @DisplayName("createSession: sessionFocusSeconds가 0 이하면 예외")
    void createSession_sessionFocusSeconds0이하_예외() {
        // given
        String userId = "11111111-1111-4111-8111-111111111111";
        String todoId = "22222222-2222-4222-8222-222222222222";
        SessionCreateRequest request = request(0, 0, "33333333-3333-4333-8333-333333333333");

        // when / then
        assertThatThrownBy(() -> sessionService.createSession(userId, todoId, request))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("sessionFocusSeconds must be >= 1");

        verifyNoInteractions(todoRepository, sessionRepository);
    }

    @Test
    @DisplayName("createSession: sessionOrder 자동 증가")
    void createSession_sessionOrder자동증가() {
        // given
        String userId = "11111111-1111-4111-8111-111111111111";
        String todoId = "22222222-2222-4222-8222-222222222222";
        String clientSessionId = "44444444-4444-4444-8444-444444444444";

        Todo todo = Todo.create(userId, "집중", null, LocalDate.of(2026, 2, 13), 0, 0);
        TodoSession last = TodoSession.create(userId, todoId, "55555555-5555-4555-8555-555555555555", 1000, 0, 3);
        SessionCreateRequest request = request(1800, 60, clientSessionId);

        when(todoRepository.findByIdAndUserIdForUpdate(todoId, userId)).thenReturn(Optional.of(todo));
        when(sessionRepository.summarizeByTodoId(todoId)).thenReturn(aggregate(0, 0));
        when(sessionRepository.findByTodoIdAndClientSessionId(todoId, clientSessionId)).thenReturn(Optional.empty());
        when(sessionRepository.findTopByTodoIdOrderBySessionOrderDesc(todoId)).thenReturn(Optional.of(last));
        when(sessionRepository.save(any(TodoSession.class))).thenAnswer(invocation -> invocation.getArgument(0));

        // when
        SessionService.CreateSessionResult result = sessionService.createSession(userId, todoId, request);

        // then
        assertThat(result.session().getSessionOrder()).isEqualTo(4);
    }

    @Test
    @DisplayName("createSession: 동일 clientSessionId 재요청 시 breakSeconds 증가분 반영")
    void createSession_동일키재요청_breakSeconds증가반영() {
        // given
        String userId = "11111111-1111-4111-8111-111111111111";
        String todoId = "22222222-2222-4222-8222-222222222222";
        String clientSessionId = "33333333-3333-4333-8333-333333333333";

        Todo todo = Todo.create(userId, "집중", null, LocalDate.of(2026, 2, 13), 0, 0);
        TodoSession existing = TodoSession.create(userId, todoId, clientSessionId, 1200, 120, 2);
        SessionCreateRequest request = request(1200, 300, clientSessionId);

        when(todoRepository.findByIdAndUserIdForUpdate(todoId, userId)).thenReturn(Optional.of(todo));
        when(sessionRepository.summarizeByTodoId(todoId)).thenReturn(aggregate(1, 1200));
        when(sessionRepository.findByTodoIdAndClientSessionId(todoId, clientSessionId)).thenReturn(Optional.of(existing));

        // when
        SessionService.CreateSessionResult result = sessionService.createSession(userId, todoId, request);

        // then
        assertThat(result.created()).isFalse();
        assertThat(existing.getBreakSeconds()).isEqualTo(300);
        assertThat(result.session().getBreakSeconds()).isEqualTo(300);
        assertThat(todo.getSessionCount()).isEqualTo(1);
        assertThat(todo.getSessionFocusSeconds()).isEqualTo(1200);
        verify(sessionRepository, never()).save(any(TodoSession.class));
    }

    @Test
    @DisplayName("createSession: 동일 clientSessionId 재요청 시 breakSeconds는 감소하지 않음")
    void createSession_동일키재요청_breakSeconds감소방지() {
        // given
        String userId = "11111111-1111-4111-8111-111111111111";
        String todoId = "22222222-2222-4222-8222-222222222222";
        String clientSessionId = "33333333-3333-4333-8333-333333333333";

        Todo todo = Todo.create(userId, "집중", null, LocalDate.of(2026, 2, 13), 0, 0);
        TodoSession existing = TodoSession.create(userId, todoId, clientSessionId, 1200, 300, 2);
        SessionCreateRequest request = request(1200, 120, clientSessionId);

        when(todoRepository.findByIdAndUserIdForUpdate(todoId, userId)).thenReturn(Optional.of(todo));
        when(sessionRepository.summarizeByTodoId(todoId)).thenReturn(aggregate(1, 1200));
        when(sessionRepository.findByTodoIdAndClientSessionId(todoId, clientSessionId)).thenReturn(Optional.of(existing));

        // when
        SessionService.CreateSessionResult result = sessionService.createSession(userId, todoId, request);

        // then
        assertThat(result.created()).isFalse();
        assertThat(existing.getBreakSeconds()).isEqualTo(300);
        assertThat(result.session().getBreakSeconds()).isEqualTo(300);
        verify(sessionRepository, never()).save(any(TodoSession.class));
    }

    @Test
    @DisplayName("createSession: 집계 드리프트가 있어도 세션 합계로 보정 후 신규 세션을 누적")
    void createSession_집계드리프트보정후신규세션누적() {
        // given
        String userId = "11111111-1111-4111-8111-111111111111";
        String todoId = "22222222-2222-4222-8222-222222222222";
        String clientSessionId = "44444444-4444-4444-8444-444444444444";

        Todo todo = Todo.create(userId, "집중", null, LocalDate.of(2026, 2, 13), 0, 0);
        TodoSession last = TodoSession.create(
                userId,
                todoId,
                "55555555-5555-4555-8555-555555555555",
                74,
                90,
                1
        );
        SessionCreateRequest request = request(1, 0, clientSessionId);

        when(todoRepository.findByIdAndUserIdForUpdate(todoId, userId)).thenReturn(Optional.of(todo));
        when(sessionRepository.summarizeByTodoId(todoId)).thenReturn(aggregate(1, 74));
        when(sessionRepository.findByTodoIdAndClientSessionId(todoId, clientSessionId)).thenReturn(Optional.empty());
        when(sessionRepository.findTopByTodoIdOrderBySessionOrderDesc(todoId)).thenReturn(Optional.of(last));
        when(sessionRepository.save(any(TodoSession.class))).thenAnswer(invocation -> invocation.getArgument(0));

        // when
        SessionService.CreateSessionResult result = sessionService.createSession(userId, todoId, request);

        // then
        assertThat(result.created()).isTrue();
        assertThat(todo.getSessionCount()).isEqualTo(2);
        assertThat(todo.getSessionFocusSeconds()).isEqualTo(75);
        assertThat(result.session().getSessionOrder()).isEqualTo(2);
    }

    @Test
    @DisplayName("createSession: Todo 미존재 시 TodoNotFoundException")
    void createSession_todo미존재_예외() {
        // given
        String userId = "11111111-1111-4111-8111-111111111111";
        String todoId = "22222222-2222-4222-8222-222222222222";
        SessionCreateRequest request = request(1500, 0, "33333333-3333-4333-8333-333333333333");

        when(todoRepository.findByIdAndUserIdForUpdate(todoId, userId)).thenReturn(Optional.empty());

        // when / then
        assertThatThrownBy(() -> sessionService.createSession(userId, todoId, request))
                .isInstanceOf(TodoNotFoundException.class)
                .hasMessageContaining(todoId);
    }

    @Test
    @DisplayName("createSession: 멱등 재요청이어도 Todo 집계가 틀려있으면 세션 합계로 보정")
    void createSession_멱등재요청_집계보정() {
        // given
        String userId = "11111111-1111-4111-8111-111111111111";
        String todoId = "22222222-2222-4222-8222-222222222222";
        String clientSessionId = "33333333-3333-4333-8333-333333333333";

        Todo todo = Todo.create(userId, "집중", null, LocalDate.of(2026, 2, 13), 0, 0);
        TodoSession existing = TodoSession.create(userId, todoId, clientSessionId, 1200, 120, 1);
        SessionCreateRequest request = request(1200, 120, clientSessionId);

        when(todoRepository.findByIdAndUserIdForUpdate(todoId, userId)).thenReturn(Optional.of(todo));
        when(sessionRepository.summarizeByTodoId(todoId)).thenReturn(aggregate(1, 1200));
        when(sessionRepository.findByTodoIdAndClientSessionId(todoId, clientSessionId)).thenReturn(Optional.of(existing));

        // when
        SessionService.CreateSessionResult result = sessionService.createSession(userId, todoId, request);

        // then
        assertThat(result.created()).isFalse();
        assertThat(todo.getSessionCount()).isEqualTo(1);
        assertThat(todo.getSessionFocusSeconds()).isEqualTo(1200);
        verify(sessionRepository, never()).save(any(TodoSession.class));
    }

    @Test
    @DisplayName("getSessions: sessionOrder 순으로 반환")
    void getSessions_순서반환() {
        // given
        String userId = "11111111-1111-4111-8111-111111111111";
        String todoId = "22222222-2222-4222-8222-222222222222";

        Todo todo = Todo.create(userId, "집중", null, LocalDate.of(2026, 2, 13), 0, 0);
        List<TodoSession> sessions = List.of(
                TodoSession.create(userId, todoId, "33333333-3333-4333-8333-333333333333", 1200, 0, 1),
                TodoSession.create(userId, todoId, "44444444-4444-4444-8444-444444444444", 900, 300, 2)
        );

        when(todoRepository.findByIdAndUserId(todoId, userId)).thenReturn(Optional.of(todo));
        when(sessionRepository.findAllByTodoIdOrderBySessionOrderAsc(todoId)).thenReturn(sessions);

        // when
        List<SessionResponse> result = sessionService.getSessions(userId, todoId);

        // then
        assertThat(result).hasSize(2);
        assertThat(result.get(0).getSessionOrder()).isEqualTo(1);
        assertThat(result.get(1).getSessionOrder()).isEqualTo(2);
    }

    private SessionCreateRequest request(int focus, Integer rest, String clientSessionId) {
        SessionCreateRequest request = new SessionCreateRequest();
        request.setSessionFocusSeconds(focus);
        request.setBreakSeconds(rest);
        request.setClientSessionId(clientSessionId);
        return request;
    }

    private TodoSessionRepository.SessionAggregate aggregate(long sessionCount, long sessionFocusSeconds) {
        return new TodoSessionRepository.SessionAggregate() {
            @Override
            public long getSessionCount() {
                return sessionCount;
            }

            @Override
            public long getSessionFocusSeconds() {
                return sessionFocusSeconds;
            }
        };
    }
}
