package kr.io.flowmate.todo.service;

import kr.io.flowmate.todo.domain.TimerMode;
import kr.io.flowmate.todo.domain.Todo;
import kr.io.flowmate.todo.dto.request.TodoCreateRequest;
import kr.io.flowmate.todo.dto.request.TodoReorderRequest;
import kr.io.flowmate.todo.dto.request.TodoUpdateRequest;
import kr.io.flowmate.todo.dto.response.TodoResponse;
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
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@DisplayName("TodoService")
class TodoServiceTest {

    private static final String USER_ID = "user-1";

    @Mock
    private TodoRepository todoRepository;

    @InjectMocks
    private TodoService todoService;

    // ── getTodos: 입력 조합 검증 + 분기별 쿼리 라우팅 ──

    @Test
    @DisplayName("getTodos: date와 from/to를 동시에 주면 IAE")
    void getTodos_dateAndFromToConflict_throwsIAE() {
        LocalDate date = LocalDate.of(2026, 4, 1);
        LocalDate from = LocalDate.of(2026, 4, 1);

        assertThatThrownBy(() -> todoService.getTodos(USER_ID, date, from, null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("date and from/to");
    }

    @Test
    @DisplayName("getTodos: from/to 중 하나만 주면 IAE")
    void getTodos_fromWithoutTo_throwsIAE() {
        LocalDate from = LocalDate.of(2026, 4, 1);

        assertThatThrownBy(() -> todoService.getTodos(USER_ID, null, from, null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("from and to");
    }

    @Test
    @DisplayName("getTodos: from이 to보다 뒤이면 IAE")
    void getTodos_fromAfterTo_throwsIAE() {
        LocalDate from = LocalDate.of(2026, 4, 10);
        LocalDate to = LocalDate.of(2026, 4, 1);

        assertThatThrownBy(() -> todoService.getTodos(USER_ID, null, from, to))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("from must not be after to");
    }

    @Test
    @DisplayName("getTodos: date 지정 시 date 쿼리로 라우팅")
    void getTodos_withDate_routesToDateQuery() {
        LocalDate date = LocalDate.of(2026, 4, 1);
        when(todoRepository.findAllByUserIdAndDateOrderByMiniDayAscDayOrderAscCreatedAtAsc(USER_ID, date))
                .thenReturn(List.of());

        todoService.getTodos(USER_ID, date, null, null);

        verify(todoRepository).findAllByUserIdAndDateOrderByMiniDayAscDayOrderAscCreatedAtAsc(USER_ID, date);
        verify(todoRepository, never()).findAllByUserIdOrderByDateAscMiniDayAscDayOrderAscCreatedAtAsc(anyString());
    }

    @Test
    @DisplayName("getTodos: from+to 지정 시 range 쿼리로 라우팅")
    void getTodos_withRange_routesToRangeQuery() {
        LocalDate from = LocalDate.of(2026, 4, 1);
        LocalDate to = LocalDate.of(2026, 4, 10);
        when(todoRepository.findAllByUserIdAndDateBetweenOrderByDateAscMiniDayAscDayOrderAscCreatedAtAsc(USER_ID, from, to))
                .thenReturn(List.of());

        todoService.getTodos(USER_ID, null, from, to);

        verify(todoRepository)
                .findAllByUserIdAndDateBetweenOrderByDateAscMiniDayAscDayOrderAscCreatedAtAsc(USER_ID, from, to);
    }

    @Test
    @DisplayName("getTodos: 모든 파라미터 null이면 전체 조회")
    void getTodos_allNull_routesToAllQuery() {
        when(todoRepository.findAllByUserIdOrderByDateAscMiniDayAscDayOrderAscCreatedAtAsc(USER_ID))
                .thenReturn(List.of());

        todoService.getTodos(USER_ID, null, null, null);

        verify(todoRepository).findAllByUserIdOrderByDateAscMiniDayAscDayOrderAscCreatedAtAsc(USER_ID);
    }

    // ── updateTodo: 부분 업데이트 + blank 거부 + Jackson setter trick ──

    @Test
    @DisplayName("updateTodo: title이 공백이면 IAE")
    void updateTodo_titleBlank_throwsIAE() {
        Todo todo = newTodo("title", LocalDate.of(2026, 4, 1));
        when(todoRepository.findByIdAndUserId(todo.getId(), USER_ID)).thenReturn(Optional.of(todo));

        TodoUpdateRequest request = new TodoUpdateRequest();
        request.setTitle("   ");

        assertThatThrownBy(() -> todoService.updateTodo(USER_ID, todo.getId(), request))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("title must not be blank");
    }

    @Test
    @DisplayName("updateTodo: note에 명시적 null을 보내면 note가 null로 지워진다")
    void updateTodo_explicitNullNote_clearsNote() {
        Todo todo = newTodo("title", LocalDate.of(2026, 4, 1));
        todo.updateNote("기존 메모");
        when(todoRepository.findByIdAndUserId(todo.getId(), USER_ID)).thenReturn(Optional.of(todo));

        TodoUpdateRequest request = new TodoUpdateRequest();
        request.setNote(null); // Jackson setter trick으로 noteProvided=true

        todoService.updateTodo(USER_ID, todo.getId(), request);

        assertThat(todo.getNote()).isNull();
    }

    @Test
    @DisplayName("updateTodo: timerMode에 공백 문자열을 보내면 null로 저장된다")
    void updateTodo_blankTimerMode_setsNull() {
        Todo todo = newTodo("title", LocalDate.of(2026, 4, 1));
        todo.updateTimerMode(TimerMode.POMODORO);
        when(todoRepository.findByIdAndUserId(todo.getId(), USER_ID)).thenReturn(Optional.of(todo));

        TodoUpdateRequest request = new TodoUpdateRequest();
        request.setTimerMode("   "); // timerModeProvided=true, value=blank

        todoService.updateTodo(USER_ID, todo.getId(), request);

        assertThat(todo.getTimerMode()).isNull();
    }

    // ── reorderTodos: N+1 회피 + 전체 거부 시맨틱 ──

    @Test
    @DisplayName("reorderTodos: 벌크 1쿼리로 대상 조회 (N+1 회피), 개별 조회 호출 0회")
    void reorderTodos_usesBulkQueryOnce_noN1() {
        Todo t1 = newTodo("a", LocalDate.of(2026, 4, 1));
        Todo t2 = newTodo("b", LocalDate.of(2026, 4, 1));
        List<String> ids = List.of(t1.getId(), t2.getId());

        when(todoRepository.findAllByIdInAndUserId(ids, USER_ID)).thenReturn(List.of(t1, t2));
        when(todoRepository.findAllByUserIdOrderByDateAscMiniDayAscDayOrderAscCreatedAtAsc(USER_ID))
                .thenReturn(List.of(t1, t2));

        TodoReorderRequest request = reorderRequest(
                reorderItem(t1.getId(), 1, 0),
                reorderItem(t2.getId(), 2, 0)
        );

        todoService.reorderTodos(USER_ID, request);

        verify(todoRepository, times(1)).findAllByIdInAndUserId(ids, USER_ID);
        verify(todoRepository, never()).findByIdAndUserId(anyString(), anyString());
    }

    @Test
    @DisplayName("reorderTodos: 동일 id 가 2번 이상 오면 silent last-write 대신 400 IAE 로 거부")
    void reorderTodos_duplicateIds_throwsIAE() {
        Todo t1 = newTodo("a", LocalDate.of(2026, 4, 1));
        TodoReorderRequest request = reorderRequest(
                reorderItem(t1.getId(), 1, 0),
                reorderItem(t1.getId(), 2, 0) // 중복 id
        );

        assertThatThrownBy(() -> todoService.reorderTodos(USER_ID, request))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("duplicate");

        verify(todoRepository, never()).findAllByIdInAndUserId(any(), anyString());
    }

    @Test
    @DisplayName("reorderTodos: 요청 id 중 하나라도 없거나 타 사용자 소유면 TodoNotFoundException")
    void reorderTodos_missingId_throwsTodoNotFound() {
        Todo t1 = newTodo("a", LocalDate.of(2026, 4, 1));
        String missingId = UUID.randomUUID().toString();

        when(todoRepository.findAllByIdInAndUserId(any(), eq(USER_ID)))
                .thenReturn(List.of(t1)); // 요청 2건 중 1건만 매칭

        TodoReorderRequest request = reorderRequest(
                reorderItem(t1.getId(), 1, 0),
                reorderItem(missingId, 1, 1)
        );

        assertThatThrownBy(() -> todoService.reorderTodos(USER_ID, request))
                .isInstanceOf(TodoNotFoundException.class);
    }

    // ── createTodo / deleteTodo: thin wrapper 이지만 기본 동작 보호 ──

    @Test
    @DisplayName("createTodo: request의 date/miniDay/dayOrder를 그대로 저장")
    void createTodo_passesRequestFieldsThrough() {
        TodoCreateRequest request = new TodoCreateRequest();
        request.setTitle("새 할 일");
        request.setNote("메모");
        request.setDate(LocalDate.of(2026, 4, 1));
        request.setMiniDay(1);
        request.setDayOrder(3);

        when(todoRepository.save(any(Todo.class))).thenAnswer(inv -> inv.getArgument(0));

        TodoResponse response = todoService.createTodo(USER_ID, request);

        assertThat(response.title()).isEqualTo("새 할 일");
        assertThat(response.date()).isEqualTo(LocalDate.of(2026, 4, 1));
        assertThat(response.miniDay()).isEqualTo(1);
        assertThat(response.dayOrder()).isEqualTo(3);
        assertThat(response.isDone()).isFalse();
    }

    @Test
    @DisplayName("deleteTodo: 존재하지 않는 id면 TodoNotFoundException")
    void deleteTodo_missing_throwsTodoNotFound() {
        when(todoRepository.findByIdAndUserId("missing", USER_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> todoService.deleteTodo(USER_ID, "missing"))
                .isInstanceOf(TodoNotFoundException.class);
    }

    // ── helpers ──

    private Todo newTodo(String title, LocalDate date) {
        return Todo.create(USER_ID, title, null, date, 0, 0);
    }

    private TodoReorderRequest reorderRequest(TodoReorderRequest.Item... items) {
        TodoReorderRequest request = new TodoReorderRequest();
        request.setItems(List.of(items));
        return request;
    }

    private TodoReorderRequest.Item reorderItem(String id, int miniDay, int dayOrder) {
        TodoReorderRequest.Item item = new TodoReorderRequest.Item();
        item.setId(id);
        item.setMiniDay(miniDay);
        item.setDayOrder(dayOrder);
        return item;
    }
}
