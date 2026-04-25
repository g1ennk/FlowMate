package kr.io.flowmate.timer.service;

import kr.io.flowmate.timer.domain.TimerState;
import kr.io.flowmate.timer.dto.request.TimerStatePushRequest;
import kr.io.flowmate.timer.dto.response.TimerStateResponse;
import kr.io.flowmate.timer.repository.TimerStateRepository;
import kr.io.flowmate.todo.domain.Todo;
import kr.io.flowmate.todo.exception.TodoNotFoundException;
import kr.io.flowmate.todo.repository.TodoRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import tools.jackson.databind.ObjectMapper;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@DisplayName("TimerService")
class TimerServiceTest {

    private static final String USER_ID = "user-1";
    private static final String TODO_ID = "todo-1";

    @Mock private TimerStateRepository timerStateRepository;
    @Mock private TodoRepository todoRepository;
    @Mock private SseEmitterRegistry sseEmitterRegistry;
    @Mock private ObjectMapper objectMapper;

    @InjectMocks private TimerService timerService;

    @Test
    @DisplayName("upsertState: running — stateJson 직렬화 + version=System.currentTimeMillis 범위 + SSE broadcast 호출")
    void upsertState_running_serializesAndBroadcasts() throws Exception {
        when(todoRepository.findByIdAndUserId(TODO_ID, USER_ID)).thenReturn(Optional.of(mock(Todo.class)));
        when(timerStateRepository.findByUserIdAndTodoId(USER_ID, TODO_ID)).thenReturn(Optional.empty());
        when(objectMapper.writeValueAsString(any())).thenReturn("{\"status\":\"running\"}");

        TimerStatePushRequest request = runningRequest();
        long before = System.currentTimeMillis();

        TimerStateResponse response = timerService.upsertState(USER_ID, TODO_ID, request);

        long after = System.currentTimeMillis();
        assertThat(response.todoId()).isEqualTo(TODO_ID);
        assertThat(response.state()).isEqualTo(request.getState());
        assertThat(response.version()).isBetween(before, after);
        verify(timerStateRepository, times(1)).saveAndFlush(any(TimerState.class));
        verify(sseEmitterRegistry).broadcast(eq(USER_ID), any(SseEmitter.SseEventBuilder.class));
    }

    @Test
    @DisplayName("upsertState: idle — stateJson null(soft delete) + state 직렬화 스킵 + response.state=null")
    void upsertState_idle_setsStateJsonNull() throws Exception {
        when(todoRepository.findByIdAndUserId(TODO_ID, USER_ID)).thenReturn(Optional.of(mock(Todo.class)));
        when(timerStateRepository.findByUserIdAndTodoId(USER_ID, TODO_ID)).thenReturn(Optional.empty());

        TimerStatePushRequest request = new TimerStatePushRequest();
        request.setStatus("idle");
        request.setState(null);

        TimerStateResponse response = timerService.upsertState(USER_ID, TODO_ID, request);

        assertThat(response.state()).isNull();
        // idle 경로는 state 직렬화가 필요 없다
        verify(objectMapper, never()).writeValueAsString(eq(request.getState()));

        ArgumentCaptor<TimerState> captor = ArgumentCaptor.forClass(TimerState.class);
        verify(timerStateRepository).saveAndFlush(captor.capture());
        assertThat(captor.getValue().getStateJson()).isNull();
    }

    @Test
    @DisplayName("upsertState: 기존 row 있으면 newVersion 이 lastVersion+1 이상으로 단조 증가")
    void upsertState_existingRow_monotonicVersion() throws Exception {
        TimerState existing = TimerState.create(TODO_ID, USER_ID);
        existing.update("{\"status\":\"running\"}", 10_000_000_000_000L); // 매우 큰 lastVersion

        when(todoRepository.findByIdAndUserId(TODO_ID, USER_ID)).thenReturn(Optional.of(mock(Todo.class)));
        when(timerStateRepository.findByUserIdAndTodoId(USER_ID, TODO_ID)).thenReturn(Optional.of(existing));
        when(objectMapper.writeValueAsString(any())).thenReturn("{\"status\":\"running\"}");

        TimerStateResponse response = timerService.upsertState(USER_ID, TODO_ID, runningRequest());

        // lastVersion 이 current millis 보다 클 때도 최소 lastVersion+1 이 보장된다
        assertThat(response.version()).isGreaterThan(10_000_000_000_000L);
    }

    @Test
    @DisplayName("upsertState: todo 가 현재 user 소유가 아니면 TodoNotFoundException")
    void upsertState_todoNotOwned_throwsNotFound() {
        when(todoRepository.findByIdAndUserId(TODO_ID, USER_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> timerService.upsertState(USER_ID, TODO_ID, runningRequest()))
                .isInstanceOf(TodoNotFoundException.class);

        verify(timerStateRepository, never()).saveAndFlush(any(TimerState.class));
        verify(sseEmitterRegistry, never()).broadcast(anyString(), any());
    }

    @Test
    @DisplayName("upsertState: 동시 first insert 로 DIV 발생 시 winner version 위에서 newVersion 재계산 + 재저장")
    void upsertState_concurrentInsertConflict_retriesWithWinnerVersion() throws Exception {
        // race winner 가 이미 1_700_000_000_000L 로 저장한 상태
        long winnerVersion = 1_700_000_000_000L;
        TimerState winnerRow = TimerState.create(TODO_ID, USER_ID);
        winnerRow.update("{\"status\":\"running\"}", winnerVersion);

        when(todoRepository.findByIdAndUserId(TODO_ID, USER_ID)).thenReturn(Optional.of(mock(Todo.class)));
        when(timerStateRepository.findByUserIdAndTodoId(USER_ID, TODO_ID))
                .thenReturn(Optional.empty())     // 첫 조회: row 없음 (create 경로로 진입)
                .thenReturn(Optional.of(winnerRow)); // DIV 후 재조회: winner row 존재
        when(objectMapper.writeValueAsString(any())).thenReturn("{\"status\":\"running\"}");
        when(timerStateRepository.saveAndFlush(any(TimerState.class)))
                .thenThrow(new DataIntegrityViolationException("duplicate key"))
                .thenAnswer(invocation -> invocation.getArgument(0));

        TimerStateResponse response = timerService.upsertState(USER_ID, TODO_ID, runningRequest());

        // 재계산된 newVersion 이 winner version 보다 반드시 커야 단조 증가 invariant 가 유지된다
        assertThat(response.version()).isGreaterThan(winnerVersion);
        verify(timerStateRepository, times(2)).saveAndFlush(any(TimerState.class));
        verify(timerStateRepository, times(2)).findByUserIdAndTodoId(USER_ID, TODO_ID);
    }

    @Test
    @DisplayName("getActiveStates: stale row 벌크 DELETE 후 state_json!=null 인 active 만 응답")
    void getActiveStates_deletesStaleAndReturnsActiveOnly() throws Exception {
        TimerState active = TimerState.create("todo-active", USER_ID);
        active.update("{\"status\":\"running\"}", 123L);
        TimerState idle = TimerState.create("todo-idle", USER_ID);
        idle.update(null, 50L); // soft delete row

        when(timerStateRepository.findAllByUserIdOrderByUpdatedAtDesc(USER_ID)).thenReturn(List.of(active, idle));
        when(objectMapper.readValue(eq("{\"status\":\"running\"}"), eq(Object.class)))
                .thenReturn("deserialized-state");

        List<TimerStateResponse> result = timerService.getActiveStates(USER_ID);

        // TTL cleanup 은 threshold 기준 단일 DELETE 로 호출된다
        ArgumentCaptor<Instant> thresholdCaptor = ArgumentCaptor.forClass(Instant.class);
        verify(timerStateRepository).deleteStaleByUserId(eq(USER_ID), thresholdCaptor.capture());
        assertThat(thresholdCaptor.getValue()).isBefore(Instant.now().minus(23, ChronoUnit.HOURS));

        // soft delete(state_json=null) 는 active 응답에서 제외
        assertThat(result).hasSize(1);
        assertThat(result.get(0).todoId()).isEqualTo("todo-active");
        assertThat(result.get(0).version()).isEqualTo(123L);
    }

    @Test
    @DisplayName("getActiveStates: row 없으면 빈 list 반환 + TTL DELETE 는 여전히 호출")
    void getActiveStates_noRows_returnsEmptyButStillRunsCleanup() {
        when(timerStateRepository.findAllByUserIdOrderByUpdatedAtDesc(USER_ID)).thenReturn(List.of());

        List<TimerStateResponse> result = timerService.getActiveStates(USER_ID);

        assertThat(result).isEmpty();
        verify(timerStateRepository).deleteStaleByUserId(eq(USER_ID), any(Instant.class));
    }

    private TimerStatePushRequest runningRequest() {
        TimerStatePushRequest request = new TimerStatePushRequest();
        request.setStatus("running");
        request.setState(new Object());
        return request;
    }
}
