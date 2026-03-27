package kr.io.flowmate.timer.service;

import kr.io.flowmate.timer.domain.TimerState;
import kr.io.flowmate.timer.dto.TimerStatePushRequest;
import kr.io.flowmate.timer.dto.TimerStateResponse;
import kr.io.flowmate.timer.repository.TimerStateRepository;
import kr.io.flowmate.todo.domain.Todo;
import kr.io.flowmate.todo.exception.TodoNotFoundException;
import kr.io.flowmate.todo.repository.TodoRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;
import tools.jackson.databind.ObjectMapper;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("TimerServiceTest")
class TimerServiceTest {

    @Mock
    private TimerStateRepository timerStateRepository;

    @Mock
    private TodoRepository todoRepository;

    @Mock
    private SseEmitterRegistry sseEmitterRegistry;

    @Mock
    private ObjectMapper objectMapper;

    @InjectMocks
    private TimerService timerService;

    private static final String USER_ID = "c6d4ed5b-9d1e-4ecd-ac4f-9c1490f6fd01";
    private static final String TODO_ID = "todo-1";

    @Test
    @DisplayName("upsertState: running 상태면 정상 저장 후 version은 currentTimeMillis 범위")
    void upsertState_running_정상저장() throws Exception {
        // given
        when(todoRepository.findByIdAndUserId(TODO_ID, USER_ID))
                .thenReturn(Optional.of(mock(Todo.class)));
        when(timerStateRepository.findByUserIdAndTodoId(USER_ID, TODO_ID))
                .thenReturn(Optional.empty());
        when(objectMapper.writeValueAsString(any())).thenReturn("{\"status\":\"running\"}");

        TimerStatePushRequest request = new TimerStatePushRequest();
        request.setStatus("running");
        request.setState(new Object());

        long before = System.currentTimeMillis();

        // when
        TimerStateResponse response = timerService.upsertState(USER_ID, TODO_ID, request);

        long after = System.currentTimeMillis();

        // then
        assertThat(response.todoId()).isEqualTo(TODO_ID);
        assertThat(response.serverTime()).isBetween(before, after);
        verify(timerStateRepository).saveAndFlush(any(TimerState.class));
    }

    @Test
    @DisplayName("upsertState: 기존 row 있으면 version 단조 증가")
    void upsertState_기존row_version단조증가() throws Exception {
        // given
        TimerState existing = TimerState.create(TODO_ID, USER_ID);
        existing.update("{\"status\":\"running\"}", 1000L);

        when(todoRepository.findByIdAndUserId(TODO_ID, USER_ID))
                .thenReturn(Optional.of(mock(Todo.class)));
        when(timerStateRepository.findByUserIdAndTodoId(USER_ID, TODO_ID))
                .thenReturn(Optional.of(existing));
        when(objectMapper.writeValueAsString(any())).thenReturn("{\"status\":\"running\"}");

        TimerStatePushRequest request = new TimerStatePushRequest();
        request.setStatus("running");
        request.setState(new Object());

        // when
        TimerStateResponse response = timerService.upsertState(USER_ID, TODO_ID, request);

        // then
        assertThat(response.serverTime()).isGreaterThan(1000L);
    }

    @Test
    @DisplayName("upsertState: idle이면 stateJson null로 저장")
    void upsertState_idle_stateJsonNull() {
        // given
        when(todoRepository.findByIdAndUserId(TODO_ID, USER_ID))
                .thenReturn(Optional.of(mock(Todo.class)));
        when(timerStateRepository.findByUserIdAndTodoId(USER_ID, TODO_ID))
                .thenReturn(Optional.empty());

        TimerStatePushRequest request = new TimerStatePushRequest();
        request.setStatus("idle");
        request.setState(null);

        // when
        TimerStateResponse response = timerService.upsertState(USER_ID, TODO_ID, request);

        // then
        assertThat(response.state()).isNull();
    }

    @Test
    @DisplayName("upsertState: todo 소유권 검증 실패 시 TodoNotFoundException")
    void upsertState_소유권실패_TodoNotFoundException() {
        // given
        when(todoRepository.findByIdAndUserId(TODO_ID, USER_ID))
                .thenReturn(Optional.empty());

        TimerStatePushRequest request = new TimerStatePushRequest();
        request.setStatus("running");
        request.setState(new Object());

        // when / then
        assertThatThrownBy(() -> timerService.upsertState(USER_ID, TODO_ID, request))
                .isInstanceOf(TodoNotFoundException.class);
    }

    @Test
    @DisplayName("upsertState: 동시 first insert PK 충돌 시 재조회 후 업데이트")
    void upsertState_PK충돌_재조회후업데이트() throws Exception {
        // given
        TimerState existingAfterCollision = TimerState.create(TODO_ID, USER_ID);

        when(todoRepository.findByIdAndUserId(TODO_ID, USER_ID))
                .thenReturn(Optional.of(mock(Todo.class)));
        when(timerStateRepository.findByUserIdAndTodoId(USER_ID, TODO_ID))
                .thenReturn(Optional.empty())                      // 첫 조회: row 없음
                .thenReturn(Optional.of(existingAfterCollision));   // 충돌 후 재조회: row 있음
        when(objectMapper.writeValueAsString(any())).thenReturn("{\"status\":\"running\"}");
        when(timerStateRepository.saveAndFlush(any(TimerState.class)))
                .thenThrow(new DataIntegrityViolationException("duplicate key"))
                .thenAnswer(invocation -> invocation.getArgument(0));

        TimerStatePushRequest request = new TimerStatePushRequest();
        request.setStatus("running");
        request.setState(new Object());

        // when
        TimerStateResponse response = timerService.upsertState(USER_ID, TODO_ID, request);

        // then
        assertThat(response.todoId()).isEqualTo(TODO_ID);
        verify(timerStateRepository, times(2)).saveAndFlush(any(TimerState.class));
        verify(timerStateRepository, times(2)).findByUserIdAndTodoId(USER_ID, TODO_ID);
    }
}
