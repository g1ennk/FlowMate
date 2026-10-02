package kr.io.flowmate.timer.service;

import kr.io.flowmate.timer.domain.TimerState;
import kr.io.flowmate.timer.dto.request.TimerStatePushRequest;
import kr.io.flowmate.timer.dto.response.TimerStateResponse;
import kr.io.flowmate.timer.event.TimerStateChangedEvent;
import kr.io.flowmate.timer.repository.TimerStateRepository;
import kr.io.flowmate.todo.domain.Todo;
import kr.io.flowmate.todo.exception.TodoNotFoundException;
import kr.io.flowmate.todo.repository.TodoRepository;
import org.hibernate.exception.ConstraintViolationException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DataIntegrityViolationException;
import tools.jackson.databind.ObjectMapper;

import java.sql.SQLException;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@DisplayName("TimerService")
class TimerServiceTest {

    private static final String USER_ID = "user-1";
    private static final String TODO_ID = "todo-1";
    private static final String RUNNING_JSON = "{\"status\":\"running\"}";

    @Mock
    private TimerStateRepository timerStateRepository;
    @Mock
    private TodoRepository todoRepository;
    @Mock
    private ObjectMapper objectMapper;
    @Mock
    private ApplicationEventPublisher applicationEventPublisher;

    @InjectMocks
    private TimerService timerService;

    @Test
    @DisplayName("upsertState: running — 직렬화한 JSON과 밀리초로 맞춘 시각으로 upsert하고, DB가 확정한 version을 응답과 이벤트에 쓴다")
    void upsertState_running_upsertsAndUsesConfirmedVersion() throws Exception {
        givenOwnedTodo();
        when(objectMapper.writeValueAsString(any())).thenReturn(RUNNING_JSON);
        when(timerStateRepository.findVersionByTodoId(TODO_ID)).thenReturn(42L);
        TimerStatePushRequest request = runningRequest();
        Instant before = Instant.now().truncatedTo(ChronoUnit.MILLIS);

        TimerStateResponse response = timerService.upsertState(USER_ID, TODO_ID, request);

        Instant after = Instant.now();
        ArgumentCaptor<Instant> now = ArgumentCaptor.forClass(Instant.class);
        verify(timerStateRepository).upsert(eq(TODO_ID), eq(USER_ID), eq(RUNNING_JSON), now.capture());
        assertThat(now.getValue()).isBetween(before, after);
        assertThat(now.getValue().getNano() % 1_000_000).isZero();

        assertThat(response).isEqualTo(new TimerStateResponse(TODO_ID, request.getState(), 42L));
        TimerStateChangedEvent event = capturePublishedEvent();
        assertThat(event.userId()).isEqualTo(USER_ID);
        assertThat(event.todoId()).isEqualTo(TODO_ID);
        assertThat(event.version()).isEqualTo(42L);
        assertThat(event.state()).isEqualTo(RUNNING_JSON);
    }

    @Test
    @DisplayName("upsertState: idle — 직렬화 없이 null 상태로 upsert하고 응답 state는 null")
    void upsertState_idle_upsertsNullState() throws Exception {
        givenOwnedTodo();
        when(timerStateRepository.findVersionByTodoId(TODO_ID)).thenReturn(7L);
        TimerStatePushRequest request = new TimerStatePushRequest();
        request.setStatus("idle");
        request.setState(null);

        TimerStateResponse response = timerService.upsertState(USER_ID, TODO_ID, request);

        verify(timerStateRepository).upsert(eq(TODO_ID), eq(USER_ID), isNull(), any(Instant.class));
        verify(objectMapper, never()).writeValueAsString(any());
        assertThat(response.state()).isNull();
        assertThat(response.version()).isEqualTo(7L);
        TimerStateChangedEvent event = capturePublishedEvent();
        assertThat(event.version()).isEqualTo(7L);
        assertThat(event.state()).isNull();
    }

    @Test
    @DisplayName("upsertState: todo 가 현재 user 소유가 아니면 TodoNotFoundException, 저장·이벤트 없음")
    void upsertState_todoNotOwned_throwsNotFound() {
        when(todoRepository.findByIdAndUserId(TODO_ID, USER_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> timerService.upsertState(USER_ID, TODO_ID, runningRequest()))
                .isInstanceOf(TodoNotFoundException.class);

        verifyNoInteractions(timerStateRepository, applicationEventPublisher);
    }

    @Test
    @DisplayName("upsertState: 저장 중 Todo가 삭제돼 Todo FK 위반이 나면 TodoNotFoundException, version 조회·이벤트 없음")
    void upsertState_todoDeletedDuringUpsert_throwsNotFoundWithoutEvent() throws Exception {
        givenOwnedTodo();
        when(objectMapper.writeValueAsString(any())).thenReturn(RUNNING_JSON);
        when(timerStateRepository.upsert(eq(TODO_ID), eq(USER_ID), eq(RUNNING_JSON), any(Instant.class)))
                .thenThrow(integrityViolation(1452, TimerService.TODO_FOREIGN_KEY));

        assertThatThrownBy(() -> timerService.upsertState(USER_ID, TODO_ID, runningRequest()))
                .isInstanceOf(TodoNotFoundException.class);

        verify(timerStateRepository, never()).findVersionByTodoId(any());
        verifyNoInteractions(applicationEventPublisher);
    }

    @Test
    @DisplayName("upsertState: Todo FK 위반이 아닌 무결성 오류는 원본 예외를 그대로 던진다")
    void upsertState_otherIntegrityViolation_propagatesOriginal() throws Exception {
        givenOwnedTodo();
        when(objectMapper.writeValueAsString(any())).thenReturn(RUNNING_JSON);
        DataIntegrityViolationException duplicate = integrityViolation(1062, "PRIMARY");
        when(timerStateRepository.upsert(eq(TODO_ID), eq(USER_ID), eq(RUNNING_JSON), any(Instant.class)))
                .thenThrow(duplicate);

        assertThatThrownBy(() -> timerService.upsertState(USER_ID, TODO_ID, runningRequest()))
                .isSameAs(duplicate);

        verifyNoInteractions(applicationEventPublisher);
    }

    @Test
    @DisplayName("isTodoForeignKeyViolation: 1452이고 제약 이름이 Todo FK일 때만 true")
    void isTodoForeignKeyViolation_matchesOnlyTodoForeignKeyWith1452() {
        assertThat(TimerService.isTodoForeignKeyViolation(
                integrityViolation(1452, TimerService.TODO_FOREIGN_KEY))).isTrue();
        assertThat(TimerService.isTodoForeignKeyViolation(
                integrityViolation(1452, "fk_other_parent"))).isFalse();
        assertThat(TimerService.isTodoForeignKeyViolation(
                integrityViolation(1062, TimerService.TODO_FOREIGN_KEY))).isFalse();
        assertThat(TimerService.isTodoForeignKeyViolation(
                new DataIntegrityViolationException("no cause"))).isFalse();
    }

    @Test
    @DisplayName("getActiveStates: 호출 시점 − 24시간 이후 갱신된 활성 상태만 조회하고 행은 지우지 않는다")
    void getActiveStates_returnsRowsUpdatedWithinLast24Hours() throws Exception {
        TimerState active = mock(TimerState.class);
        when(active.getTodoId()).thenReturn("todo-active");
        when(active.getStateJson()).thenReturn(RUNNING_JSON);
        when(active.getVersion()).thenReturn(123L);
        when(timerStateRepository.findActiveSince(eq(USER_ID), any(Instant.class))).thenReturn(List.of(active));
        when(objectMapper.readValue(RUNNING_JSON, Object.class)).thenReturn("deserialized-state");
        Instant before = Instant.now().truncatedTo(ChronoUnit.MILLIS).minus(24, ChronoUnit.HOURS);

        List<TimerStateResponse> result = timerService.getActiveStates(USER_ID);

        Instant after = Instant.now().minus(24, ChronoUnit.HOURS);
        ArgumentCaptor<Instant> threshold = ArgumentCaptor.forClass(Instant.class);
        verify(timerStateRepository).findActiveSince(eq(USER_ID), threshold.capture());
        assertThat(threshold.getValue()).isBetween(before, after);
        verifyNoMoreInteractions(timerStateRepository);
        assertThat(result).containsExactly(new TimerStateResponse("todo-active", "deserialized-state", 123L));
    }

    @Test
    @DisplayName("getActiveStates: 활성 상태가 없으면 빈 목록")
    void getActiveStates_noRows_returnsEmpty() {
        when(timerStateRepository.findActiveSince(eq(USER_ID), any(Instant.class))).thenReturn(List.of());

        List<TimerStateResponse> result = timerService.getActiveStates(USER_ID);

        assertThat(result).isEmpty();
        verify(timerStateRepository).findActiveSince(eq(USER_ID), any(Instant.class));
        verifyNoMoreInteractions(timerStateRepository);
    }

    private void givenOwnedTodo() {
        when(todoRepository.findByIdAndUserId(TODO_ID, USER_ID)).thenReturn(Optional.of(mock(Todo.class)));
    }

    private TimerStateChangedEvent capturePublishedEvent() {
        ArgumentCaptor<TimerStateChangedEvent> captor = ArgumentCaptor.forClass(TimerStateChangedEvent.class);
        verify(applicationEventPublisher).publishEvent(captor.capture());
        return captor.getValue();
    }

    private TimerStatePushRequest runningRequest() {
        TimerStatePushRequest request = new TimerStatePushRequest();
        request.setStatus("running");
        request.setState(new Object());
        return request;
    }

    private static DataIntegrityViolationException integrityViolation(int mysqlErrorCode, String constraintName) {
        SQLException sql = new SQLException("constraint violation", "23000", mysqlErrorCode);
        ConstraintViolationException hibernate =
                new ConstraintViolationException("could not execute statement", sql, constraintName);
        return new DataIntegrityViolationException("could not execute statement", hibernate);
    }
}
