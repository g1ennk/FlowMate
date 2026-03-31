package kr.io.flowmate.timer.service;

import kr.io.flowmate.timer.domain.TimerState;
import kr.io.flowmate.timer.dto.request.TimerStatePushRequest;
import kr.io.flowmate.timer.dto.response.TimerStateResponse;
import kr.io.flowmate.timer.repository.TimerStateRepository;
import kr.io.flowmate.todo.domain.Todo;
import kr.io.flowmate.todo.exception.TodoNotFoundException;
import kr.io.flowmate.todo.repository.TodoRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;
import tools.jackson.databind.ObjectMapper;

import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;
import static org.mockito.Mockito.lenient;

@ExtendWith(MockitoExtension.class)
@DisplayName("TimerService")
class TimerServiceTest {

    @Mock private TimerStateRepository timerStateRepository;
    @Mock private TodoRepository todoRepository;
    @Mock private SseEmitterRegistry sseEmitterRegistry;
    @Mock private ObjectMapper objectMapper;

    @InjectMocks
    private TimerService timerService;

    private static final String USER_ID = "user-1";
    private static final String TODO_ID = "todo-1";

    private TimerStatePushRequest createPushRequest(String status, Object state) {
        TimerStatePushRequest req = new TimerStatePushRequest();
        req.setStatus(status);
        req.setState(state);
        return req;
    }

    @Nested
    @DisplayName("upsertState")
    class UpsertState {
        @Test
        @DisplayName("upsertState: running 상태 → 정상 저장 + version이 currentTimeMillis 범위")
        void upsertState_running_savesWithCurrentVersion() throws Exception {
            // given
            Todo todo = Todo.create(USER_ID, "제목", null, LocalDate.now(), 0, 0);
            when(todoRepository.findByIdAndUserId(TODO_ID, USER_ID)).thenReturn(Optional.of(todo));
            when(timerStateRepository.findByUserIdAndTodoId(USER_ID, TODO_ID)).thenReturn(Optional.empty());
            when(objectMapper.writeValueAsString(any())).thenReturn("{\"mode\":\"pomodoro\"}");

            long before = System.currentTimeMillis();

            // when
            TimerStateResponse result = timerService.upsertState(USER_ID, TODO_ID,
                    createPushRequest("running", Map.of("mode", "pomodoro")));

            // then
            long after = System.currentTimeMillis();
            assertThat(result.todoId()).isEqualTo(TODO_ID);
            assertThat(result.serverTime()).isBetween(before, after + 1);
            verify(timerStateRepository).saveAndFlush(any(TimerState.class));
        }

        @Test
        @DisplayName("upsertState: 기존 row → version 단조 증가")
        void upsertState_existingRow_incrementsVersion() throws Exception {
            // given
            Todo todo = Todo.create(USER_ID, "제목", null, LocalDate.now(), 0, 0);
            when(todoRepository.findByIdAndUserId(TODO_ID, USER_ID)).thenReturn(Optional.of(todo));

            TimerState existing = TimerState.create(TODO_ID, USER_ID);
            existing.update("{}", 1000L);
            when(timerStateRepository.findByUserIdAndTodoId(USER_ID, TODO_ID)).thenReturn(Optional.of(existing));
            when(objectMapper.writeValueAsString(any())).thenReturn("{}");

            // when
            TimerStateResponse result = timerService.upsertState(USER_ID, TODO_ID,
                    createPushRequest("running", Map.of()));

            // then
            assertThat(result.serverTime()).isGreaterThan(1000L);
        }

        @Test
        @DisplayName("upsertState: idle → stateJson null로 소프트삭제")
        void upsertState_idle_softDeletes() throws Exception {
            // given
            Todo todo = Todo.create(USER_ID, "제목", null, LocalDate.now(), 0, 0);
            when(todoRepository.findByIdAndUserId(TODO_ID, USER_ID)).thenReturn(Optional.of(todo));
            when(timerStateRepository.findByUserIdAndTodoId(USER_ID, TODO_ID)).thenReturn(Optional.empty());
            // broadcast에서 null state를 직렬화할 때 호출됨
            lenient().when(objectMapper.writeValueAsString(any())).thenReturn("null");

            // when
            TimerStateResponse result = timerService.upsertState(USER_ID, TODO_ID,
                    createPushRequest("idle", null));

            // then
            assertThat(result.state()).isNull();
        }

        @Test
        @DisplayName("upsertState: todo 미존재 → TodoNotFoundException")
        void upsertState_todoNotFound_throwsException() {
            // given
            when(todoRepository.findByIdAndUserId(TODO_ID, USER_ID)).thenReturn(Optional.empty());

            // when & then
            assertThatThrownBy(() -> timerService.upsertState(USER_ID, TODO_ID,
                    createPushRequest("running", Map.of())))
                    .isInstanceOf(TodoNotFoundException.class);
        }

        @Test
        @DisplayName("upsertState: PK 충돌 → 재조회 후 업데이트")
        void upsertState_pkConflict_retriesUpdate() throws Exception {
            // given
            Todo todo = Todo.create(USER_ID, "제목", null, LocalDate.now(), 0, 0);
            when(todoRepository.findByIdAndUserId(TODO_ID, USER_ID)).thenReturn(Optional.of(todo));

            TimerState retried = TimerState.create(TODO_ID, USER_ID);
            when(timerStateRepository.findByUserIdAndTodoId(USER_ID, TODO_ID))
                    .thenReturn(Optional.empty())
                    .thenReturn(Optional.of(retried));
            when(objectMapper.writeValueAsString(any())).thenReturn("{}");
            when(timerStateRepository.saveAndFlush(any(TimerState.class)))
                    .thenThrow(new DataIntegrityViolationException("pk conflict"))
                    .thenReturn(retried);

            // when
            timerService.upsertState(USER_ID, TODO_ID, createPushRequest("running", Map.of()));

            // then
            verify(timerStateRepository, times(2)).saveAndFlush(any());
            verify(timerStateRepository, times(2)).findByUserIdAndTodoId(USER_ID, TODO_ID);
        }

        @Test
        @DisplayName("upsertState: 저장 후 SSE broadcast 호출 검증")
        void upsertState_afterSave_broadcastsCalled() throws Exception {
            // given
            Todo todo = Todo.create(USER_ID, "제목", null, LocalDate.now(), 0, 0);
            when(todoRepository.findByIdAndUserId(TODO_ID, USER_ID)).thenReturn(Optional.of(todo));
            when(timerStateRepository.findByUserIdAndTodoId(USER_ID, TODO_ID)).thenReturn(Optional.empty());
            when(objectMapper.writeValueAsString(any())).thenReturn("{}");

            // when
            timerService.upsertState(USER_ID, TODO_ID, createPushRequest("running", Map.of()));

            // then
            verify(sseEmitterRegistry).broadcast(eq(USER_ID), any());
        }
    }

    @Nested
    @DisplayName("getActiveStates")
    class GetActiveStates {
        @Test
        @DisplayName("getActiveStates: active 상태만 반환 (stateJson != null)")
        void getActiveStates_returnsOnlyActive() throws Exception {
            // given — cleanup 후 남은 row만 반환
            TimerState activeMock = mock(TimerState.class);
            when(activeMock.getTodoId()).thenReturn(TODO_ID);
            when(activeMock.getStateJson()).thenReturn("{\"mode\":\"pomodoro\"}");
            when(activeMock.getVersion()).thenReturn(100L);

            TimerState idleMock = mock(TimerState.class);
            when(idleMock.getStateJson()).thenReturn(null);

            when(timerStateRepository.findAllByUserIdOrderByUpdatedAtDesc(USER_ID))
                    .thenReturn(List.of(activeMock, idleMock));
            when(objectMapper.readValue("{\"mode\":\"pomodoro\"}", Object.class))
                    .thenReturn(Map.of("mode", "pomodoro"));

            // when
            List<TimerStateResponse> result = timerService.getActiveStates(USER_ID);

            // then
            assertThat(result).hasSize(1);
            assertThat(result.getFirst().todoId()).isEqualTo(TODO_ID);
        }

        @Test
        @DisplayName("getActiveStates: 24시간 초과 → bulk DELETE 호출")
        void getActiveStates_staleRows_bulkDeleted() {
            // given
            when(timerStateRepository.findAllByUserIdOrderByUpdatedAtDesc(USER_ID))
                    .thenReturn(List.of());

            // when
            timerService.getActiveStates(USER_ID);

            // then
            verify(timerStateRepository).deleteStaleByUserId(eq(USER_ID), any(Instant.class));
        }

        @Test
        @DisplayName("getActiveStates: 빈 목록 → 빈 리스트")
        void getActiveStates_empty_returnsEmptyList() {
            // given
            when(timerStateRepository.findAllByUserIdOrderByUpdatedAtDesc(USER_ID))
                    .thenReturn(List.of());

            // when
            List<TimerStateResponse> result = timerService.getActiveStates(USER_ID);

            // then
            assertThat(result).isEmpty();
        }
    }
}
