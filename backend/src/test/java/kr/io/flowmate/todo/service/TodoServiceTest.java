package kr.io.flowmate.todo.service;

import kr.io.flowmate.todo.domain.Todo;
import kr.io.flowmate.todo.dto.TodoCreateRequest;
import kr.io.flowmate.todo.dto.TodoReorderRequest;
import kr.io.flowmate.todo.dto.TodoResponse;
import kr.io.flowmate.todo.dto.TodoUpdateRequest;
import kr.io.flowmate.todo.exception.TodoNotFoundException;
import kr.io.flowmate.todo.repository.TodoRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("TodoServiceTest")
class TodoServiceTest {

    @Mock
    private TodoRepository todoRepository;

    @InjectMocks
    private TodoService todoService;

    @Test
    @DisplayName("getTodos: date 없으면 전체 목록 조회")
    void getTodos_date없음_전체조회() {
        // given
        String userId = "c6d4ed5b-9d1e-4ecd-ac4f-9c1490f6fd01";
        LocalDate date = LocalDate.of(2026, 2, 11);
        List<Todo> todos = List.of(
                Todo.create(userId, "A", "n1", date, 0, 0),
                Todo.create(userId, "B", null, date, 1, 1)
        );
        when(todoRepository.findAllByUserIdOrderByDateAscMiniDayAscDayOrderAscCreatedAtAsc(userId))
                .thenReturn(todos);

        // when
        List<TodoResponse> result = todoService.getTodos(userId, null);

        // then
        assertThat(result).hasSize(2);
        assertThat(result.get(0).getTitle()).isEqualTo("A");
        assertThat(result.get(1).getTitle()).isEqualTo("B");
        verify(todoRepository).findAllByUserIdOrderByDateAscMiniDayAscDayOrderAscCreatedAtAsc(userId);
    }

    @Test
    @DisplayName("getTodos: date 있으면 날짜 필터 조회")
    void getTodos_date있음_날짜필터조회() {
        // given
        String userId = "c6d4ed5b-9d1e-4ecd-ac4f-9c1490f6fd01";
        LocalDate date = LocalDate.of(2026, 2, 11);
        List<Todo> todos = List.of(Todo.create(userId, "A", null, date, 0, 0));
        when(todoRepository.findAllByUserIdAndDateOrderByMiniDayAscDayOrderAscCreatedAtAsc(userId, date))
                .thenReturn(todos);

        // when
        List<TodoResponse> result = todoService.getTodos(userId, date);

        // then
        assertThat(result).hasSize(1);
        assertThat(result.get(0).getDate()).isEqualTo(date);
        verify(todoRepository).findAllByUserIdAndDateOrderByMiniDayAscDayOrderAscCreatedAtAsc(userId, date);
    }

    @Test
    @DisplayName("createTodo: 모든 필드가 있으면 그대로 저장")
    void createTodo_모든필드제공_그대로저장() {
        // given
        String userId = "c6d4ed5b-9d1e-4ecd-ac4f-9c1490f6fd01";
        LocalDate date = LocalDate.of(2026, 2, 11);
        TodoCreateRequest request = new TodoCreateRequest();
        request.setTitle("회의");
        request.setNote("팀 미팅");
        request.setDate(date);
        request.setMiniDay(2);
        request.setDayOrder(7);

        when(todoRepository.save(any(Todo.class))).thenAnswer(invocation -> invocation.getArgument(0));

        // when
        TodoResponse result = todoService.createTodo(userId, request);

        // then
        assertThat(result.getTitle()).isEqualTo("회의");
        assertThat(result.getNote()).isEqualTo("팀 미팅");
        assertThat(result.getDate()).isEqualTo(date);
        assertThat(result.getMiniDay()).isEqualTo(2);
        assertThat(result.getDayOrder()).isEqualTo(7);
        verify(todoRepository).save(any(Todo.class));
    }

    @Test
    @DisplayName("updateTodo: 부분 수정은 제공된 필드만 반영")
    void updateTodo_부분수정_제공필드만반영() {
        // given
        String userId = "c6d4ed5b-9d1e-4ecd-ac4f-9c1490f6fd01";
        String todoId = "todo-1";
        Todo todo = Todo.create(userId, "원래제목", "원래노트", LocalDate.of(2026, 2, 11), 0, 1);
        when(todoRepository.findByIdAndUserId(todoId, userId)).thenReturn(Optional.of(todo));
        TodoUpdateRequest request = new TodoUpdateRequest();
        request.setTitle("수정제목");
        request.setIsDone(true);
        request.setMiniDay(2);
        request.setDayOrder(4);

        // when
        TodoResponse result = todoService.updateTodo(userId, todoId, request);

        // then
        assertThat(result.getTitle()).isEqualTo("수정제목");
        assertThat(result.getIsDone()).isTrue();
        assertThat(result.getMiniDay()).isEqualTo(2);
        assertThat(result.getDayOrder()).isEqualTo(4);
        assertThat(result.getNote()).isEqualTo("원래노트");
        verify(todoRepository).findByIdAndUserId(todoId, userId);
    }

    @Test
    @DisplayName("updateTodo: note를 명시적으로 null로 보내면 삭제")
    void updateTodo_note명시적null_노트삭제() {
        // given
        String userId = "c6d4ed5b-9d1e-4ecd-ac4f-9c1490f6fd01";
        String todoId = "todo-1";
        Todo todo = Todo.create(userId, "제목", "남길노트", LocalDate.of(2026, 2, 11), 0, 0);
        when(todoRepository.findByIdAndUserId(todoId, userId)).thenReturn(Optional.of(todo));

        TodoUpdateRequest request = new TodoUpdateRequest();
        request.setNote(null);

        // when
        TodoResponse result = todoService.updateTodo(userId, todoId, request);

        // then
        assertThat(result.getNote()).isNull();
    }

    @Test
    @DisplayName("updateTodo: date를 전달하면 날짜만 변경")
    void updateTodo_date전달_날짜변경() {
        // given
        String userId = "c6d4ed5b-9d1e-4ecd-ac4f-9c1490f6fd01";
        String todoId = "todo-1";
        Todo todo = Todo.create(userId, "제목", "노트", LocalDate.of(2026, 2, 11), 1, 2);
        when(todoRepository.findByIdAndUserId(todoId, userId)).thenReturn(Optional.of(todo));

        TodoUpdateRequest request = new TodoUpdateRequest();
        request.setDate(LocalDate.of(2026, 2, 12));

        // when
        TodoResponse result = todoService.updateTodo(userId, todoId, request);

        // then
        assertThat(result.getDate()).isEqualTo(LocalDate.of(2026, 2, 12));
        assertThat(result.getTitle()).isEqualTo("제목");
        assertThat(result.getNote()).isEqualTo("노트");
        assertThat(result.getMiniDay()).isEqualTo(1);
        assertThat(result.getDayOrder()).isEqualTo(2);
    }

    @Test
    @DisplayName("updateTodo: date와 dayOrder를 함께 전달하면 둘 다 반영")
    void updateTodo_date와DayOrder_함께반영() {
        // given
        String userId = "c6d4ed5b-9d1e-4ecd-ac4f-9c1490f6fd01";
        String todoId = "todo-1";
        Todo todo = Todo.create(userId, "제목", null, LocalDate.of(2026, 2, 11), 0, 0);
        when(todoRepository.findByIdAndUserId(todoId, userId)).thenReturn(Optional.of(todo));

        TodoUpdateRequest request = new TodoUpdateRequest();
        request.setDate(LocalDate.of(2026, 2, 14));
        request.setDayOrder(5);

        // when
        TodoResponse result = todoService.updateTodo(userId, todoId, request);

        // then
        assertThat(result.getDate()).isEqualTo(LocalDate.of(2026, 2, 14));
        assertThat(result.getDayOrder()).isEqualTo(5);
        assertThat(result.getMiniDay()).isEqualTo(0);
    }

    @Test
    @DisplayName("updateTodo: date 변경 시 session 집계와 timerMode는 유지")
    void updateTodo_date변경_기록유지() {
        // given
        String userId = "c6d4ed5b-9d1e-4ecd-ac4f-9c1490f6fd01";
        String todoId = "todo-1";
        Todo todo = Todo.create(userId, "제목", null, LocalDate.of(2026, 2, 11), 0, 0);
        todo.incrementSessionCount();
        todo.addSessionFocusSeconds(1500);
        todo.updateTimerMode(kr.io.flowmate.todo.domain.TimerMode.STOPWATCH);
        when(todoRepository.findByIdAndUserId(todoId, userId)).thenReturn(Optional.of(todo));

        TodoUpdateRequest request = new TodoUpdateRequest();
        request.setDate(LocalDate.of(2026, 2, 13));

        // when
        TodoResponse result = todoService.updateTodo(userId, todoId, request);

        // then
        assertThat(result.getDate()).isEqualTo(LocalDate.of(2026, 2, 13));
        assertThat(result.getSessionCount()).isEqualTo(1);
        assertThat(result.getSessionFocusSeconds()).isEqualTo(1500);
        assertThat(result.getTimerMode()).isEqualTo("stopwatch");
    }

    @Test
    @DisplayName("updateTodo: date를 보내지 않으면 기존 날짜 유지")
    void updateTodo_date미전달_기존날짜유지() {
        // given
        String userId = "c6d4ed5b-9d1e-4ecd-ac4f-9c1490f6fd01";
        String todoId = "todo-1";
        LocalDate originalDate = LocalDate.of(2026, 2, 11);
        Todo todo = Todo.create(userId, "원래제목", null, originalDate, 0, 0);
        when(todoRepository.findByIdAndUserId(todoId, userId)).thenReturn(Optional.of(todo));

        TodoUpdateRequest request = new TodoUpdateRequest();
        request.setTitle("새제목");

        // when
        TodoResponse result = todoService.updateTodo(userId, todoId, request);

        // then
        assertThat(result.getTitle()).isEqualTo("새제목");
        assertThat(result.getDate()).isEqualTo(originalDate);
    }

    @Test
    @DisplayName("updateTodo: timerMode pomodoro 반영")
    void updateTodo_timerModePomodoro_반영() {
        // given
        String userId = "c6d4ed5b-9d1e-4ecd-ac4f-9c1490f6fd01";
        String todoId = "todo-1";
        Todo todo = Todo.create(userId, "제목", null, LocalDate.of(2026, 2, 11), 0, 0);
        when(todoRepository.findByIdAndUserId(todoId, userId)).thenReturn(Optional.of(todo));
        TodoUpdateRequest request = new TodoUpdateRequest();
        request.setTimerMode("pomodoro");

        // when
        TodoResponse result = todoService.updateTodo(userId, todoId, request);

        // then
        assertThat(result.getTimerMode()).isEqualTo("pomodoro");
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"", "   "})
    @DisplayName("updateTodo: timerMode가 null/blank면 null 처리")
    void updateTodo_timerModeNullOrBlank_null처리(String rawTimerMode) {
        // given
        String userId = "c6d4ed5b-9d1e-4ecd-ac4f-9c1490f6fd01";
        String todoId = "todo-1";
        Todo todo = Todo.create(userId, "제목", null, LocalDate.of(2026, 2, 11), 0, 0);
        todo.updateTimerMode(kr.io.flowmate.todo.domain.TimerMode.POMODORO);
        when(todoRepository.findByIdAndUserId(todoId, userId)).thenReturn(Optional.of(todo));
        TodoUpdateRequest request = new TodoUpdateRequest();
        request.setTimerMode(rawTimerMode);

        // when
        TodoResponse result = todoService.updateTodo(userId, todoId, request);

        // then
        assertThat(result.getTimerMode()).isNull();
    }

    @Test
    @DisplayName("reorderTodos: 정상 요청은 순서/섹션 갱신 후 재조회 결과 반환")
    void reorderTodos_정상요청_순서섹션갱신후재조회반환() {
        // given
        String userId = "c6d4ed5b-9d1e-4ecd-ac4f-9c1490f6fd01";
        Todo todo1 = Todo.create(userId, "A", null, LocalDate.of(2026, 2, 11), 0, 0);
        Todo todo2 = Todo.create(userId, "B", null, LocalDate.of(2026, 2, 11), 0, 1);
        when(todoRepository.findByIdAndUserId("todo-1", userId)).thenReturn(Optional.of(todo1));
        when(todoRepository.findByIdAndUserId("todo-2", userId)).thenReturn(Optional.of(todo2));
        when(todoRepository.findAllByUserIdOrderByDateAscMiniDayAscDayOrderAscCreatedAtAsc(userId))
                .thenReturn(List.of(todo2, todo1));

        TodoReorderRequest request = new TodoReorderRequest();
        request.setItems(List.of(
                reorderItem("todo-1", 5, 2),
                reorderItem("todo-2", 3, 1)
        ));

        // when
        List<TodoResponse> result = todoService.reorderTodos(userId, request);

        // then
        assertThat(todo1.getDayOrder()).isEqualTo(5);
        assertThat(todo1.getMiniDay()).isEqualTo(2);
        assertThat(todo2.getDayOrder()).isEqualTo(3);
        assertThat(todo2.getMiniDay()).isEqualTo(1);

        assertThat(result).hasSize(2);
        assertThat(result.get(0).getTitle()).isEqualTo("B");
        assertThat(result.get(1).getTitle()).isEqualTo("A");
        verify(todoRepository).findAllByUserIdOrderByDateAscMiniDayAscDayOrderAscCreatedAtAsc(userId);
    }

    @Test
    @DisplayName("updateTodo: todo가 없으면 TodoNotFoundException")
    void updateTodo_없으면_TodoNotFoundException() {
        // given
        String userId = "c6d4ed5b-9d1e-4ecd-ac4f-9c1490f6fd01";
        String todoId = "missing";
        when(todoRepository.findByIdAndUserId(todoId, userId)).thenReturn(Optional.empty());
        TodoUpdateRequest request = new TodoUpdateRequest();
        request.setTitle("수정");

        // when / then
        assertThatThrownBy(() -> todoService.updateTodo(userId, todoId, request))
                .isInstanceOf(TodoNotFoundException.class)
                .hasMessageContaining(todoId);
    }

    @Test
    @DisplayName("deleteTodo: todo가 없으면 TodoNotFoundException")
    void deleteTodo_없으면_TodoNotFoundException() {
        // given
        String userId = "c6d4ed5b-9d1e-4ecd-ac4f-9c1490f6fd01";
        String todoId = "missing";
        when(todoRepository.findByIdAndUserId(todoId, userId)).thenReturn(Optional.empty());

        // when / then
        assertThatThrownBy(() -> todoService.deleteTodo(userId, todoId))
                .isInstanceOf(TodoNotFoundException.class)
                .hasMessageContaining(todoId);
    }

    @Test
    @DisplayName("scheduleReview: 완료된 일반 Todo는 1회차 복습 Todo를 생성")
    void scheduleReview_완료된일반Todo_1회차생성() {
        String userId = "c6d4ed5b-9d1e-4ecd-ac4f-9c1490f6fd01";
        String todoId = "todo-1";
        Todo todo = Todo.create(userId, "JPA 정리", "메모", LocalDate.of(2026, 3, 21), 2, 0);
        todo.updateDone(true);

        when(todoRepository.findByIdAndUserId(todoId, userId)).thenReturn(Optional.of(todo));
        when(todoRepository.findByUserIdAndOriginalTodoIdAndReviewRound(userId, todo.getId(), 1))
                .thenReturn(Optional.empty());
        when(todoRepository.findMaxDayOrderForUndone(userId, LocalDate.of(2026, 3, 22), 0))
                .thenReturn(0);
        when(todoRepository.save(any(Todo.class))).thenAnswer(invocation -> invocation.getArgument(0));

        TodoService.ScheduleReviewResult result = todoService.scheduleReview(userId, todoId);

        assertThat(result.created()).isTrue();
        assertThat(result.item().getTitle()).isEqualTo("JPA 정리");
        assertThat(result.item().getNote()).isEqualTo("메모");
        assertThat(result.item().getDate()).isEqualTo(LocalDate.of(2026, 3, 22));
        assertThat(result.item().getMiniDay()).isEqualTo(0);
        assertThat(result.item().getDayOrder()).isEqualTo(1);
        assertThat(result.item().getReviewRound()).isEqualTo(1);
        assertThat(result.item().getOriginalTodoId()).isEqualTo(todo.getId());
        assertThat(result.item().getIsDone()).isFalse();
    }

    @Test
    @DisplayName("scheduleReview: 일반 Todo 제목의 [복습 N회] 접두사는 사용자 입력 그대로 보존")
    void scheduleReview_일반TodoPrefix제목_그대로보존() {
        String userId = "c6d4ed5b-9d1e-4ecd-ac4f-9c1490f6fd01";
        String todoId = "todo-prefix";
        Todo todo = Todo.create(userId, "[복습 1회] 실제 제목", null, LocalDate.of(2026, 3, 21), 0, 0);
        todo.updateDone(true);

        when(todoRepository.findByIdAndUserId(todoId, userId)).thenReturn(Optional.of(todo));
        when(todoRepository.findByUserIdAndOriginalTodoIdAndReviewRound(userId, todo.getId(), 1))
                .thenReturn(Optional.empty());
        when(todoRepository.findMaxDayOrderForUndone(userId, LocalDate.of(2026, 3, 22), 0))
                .thenReturn(-1);
        when(todoRepository.save(any(Todo.class))).thenAnswer(invocation -> invocation.getArgument(0));

        TodoService.ScheduleReviewResult result = todoService.scheduleReview(userId, todoId);

        assertThat(result.created()).isTrue();
        assertThat(result.item().getTitle()).isEqualTo("[복습 1회] 실제 제목");
    }

    @Test
    @DisplayName("scheduleReview: 완료된 복습 Todo는 다음 회차를 생성")
    void scheduleReview_완료된복습Todo_다음회차생성() {
        String userId = "c6d4ed5b-9d1e-4ecd-ac4f-9c1490f6fd01";
        String rootTodoId = "root-todo";
        String todoId = "review-todo-1";
        Todo rootTodo = Todo.create(userId, "알고리즘 정리", "루트 메모", LocalDate.of(2026, 3, 20), 0, 0);
        Todo reviewTodo = Todo.createReview(
                userId,
                rootTodoId,
                "알고리즘 정리",
                "최신 메모",
                LocalDate.of(2026, 3, 21),
                0,
                0,
                1
        );
        reviewTodo.updateDone(true);

        when(todoRepository.findByIdAndUserId(todoId, userId)).thenReturn(Optional.of(reviewTodo));
        when(todoRepository.findByUserIdAndOriginalTodoIdAndReviewRound(userId, rootTodoId, 2))
                .thenReturn(Optional.empty());
        when(todoRepository.findByIdAndUserId(rootTodoId, userId)).thenReturn(Optional.of(rootTodo));
        when(todoRepository.findMaxDayOrderForUndone(userId, LocalDate.of(2026, 3, 23), 0))
                .thenReturn(-1);
        when(todoRepository.save(any(Todo.class))).thenAnswer(invocation -> invocation.getArgument(0));

        TodoService.ScheduleReviewResult result = todoService.scheduleReview(userId, todoId);

        assertThat(result.created()).isTrue();
        assertThat(result.item().getTitle()).isEqualTo("알고리즘 정리");
        assertThat(result.item().getNote()).isEqualTo("최신 메모");
        assertThat(result.item().getDate()).isEqualTo(LocalDate.of(2026, 3, 23));
        assertThat(result.item().getDayOrder()).isEqualTo(0);
        assertThat(result.item().getReviewRound()).isEqualTo(2);
        assertThat(result.item().getOriginalTodoId()).isEqualTo(rootTodoId);
    }

    @Test
    @DisplayName("scheduleReview: 미완료 Todo는 복습 등록할 수 없다")
    void scheduleReview_미완료Todo_예외() {
        String userId = "c6d4ed5b-9d1e-4ecd-ac4f-9c1490f6fd01";
        String todoId = "todo-1";
        Todo todo = Todo.create(userId, "제목", null, LocalDate.of(2026, 3, 21), 0, 0);

        when(todoRepository.findByIdAndUserId(todoId, userId)).thenReturn(Optional.of(todo));

        assertThatThrownBy(() -> todoService.scheduleReview(userId, todoId))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("완료된 Todo만 복습 등록할 수 있습니다");
    }

    @Test
    @DisplayName("scheduleReview: 6회차 완료 Todo는 다음 복습을 만들 수 없다")
    void scheduleReview_6회차완료Todo_예외() {
        String userId = "c6d4ed5b-9d1e-4ecd-ac4f-9c1490f6fd01";
        String todoId = "review-6";
        Todo todo = Todo.createReview(
                userId,
                "root-todo",
                "제목",
                null,
                LocalDate.of(2026, 3, 21),
                0,
                0,
                6
        );
        todo.updateDone(true);

        when(todoRepository.findByIdAndUserId(todoId, userId)).thenReturn(Optional.of(todo));

        assertThatThrownBy(() -> todoService.scheduleReview(userId, todoId))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("복습이 모두 완료된 Todo입니다");
    }

    @Test
    @DisplayName("scheduleReview: 같은 회차가 이미 있으면 기존 Todo를 반환")
    void scheduleReview_같은회차기존존재_기존반환() {
        String userId = "c6d4ed5b-9d1e-4ecd-ac4f-9c1490f6fd01";
        String todoId = "todo-1";
        Todo todo = Todo.create(userId, "제목", null, LocalDate.of(2026, 3, 21), 0, 0);
        todo.updateDone(true);
        Todo existing = Todo.createReview(
                userId,
                todo.getId(),
                "제목",
                null,
                LocalDate.of(2026, 3, 22),
                0,
                0,
                1
        );

        when(todoRepository.findByIdAndUserId(todoId, userId)).thenReturn(Optional.of(todo));
        when(todoRepository.findByUserIdAndOriginalTodoIdAndReviewRound(userId, todo.getId(), 1))
                .thenReturn(Optional.of(existing));

        TodoService.ScheduleReviewResult result = todoService.scheduleReview(userId, todoId);

        assertThat(result.created()).isFalse();
        assertThat(result.item().getTitle()).isEqualTo("제목");
        verify(todoRepository, never()).save(any(Todo.class));
    }

    @Test
    @DisplayName("scheduleReview: 원본이 삭제된 체인은 현재 제목을 그대로 사용한다")
    void scheduleReview_원본삭제_현재제목기준으로생성() {
        String userId = "c6d4ed5b-9d1e-4ecd-ac4f-9c1490f6fd01";
        String rootTodoId = "deleted-root";
        String todoId = "review-1";
        Todo reviewTodo = Todo.createReview(
                userId,
                rootTodoId,
                "[복습 1회] 운영체제 정리",
                null,
                LocalDate.of(2026, 3, 21),
                0,
                0,
                1
        );
        reviewTodo.updateDone(true);

        when(todoRepository.findByIdAndUserId(todoId, userId)).thenReturn(Optional.of(reviewTodo));
        when(todoRepository.findByUserIdAndOriginalTodoIdAndReviewRound(userId, rootTodoId, 2))
                .thenReturn(Optional.empty());
        when(todoRepository.findByIdAndUserId(rootTodoId, userId)).thenReturn(Optional.empty());
        when(todoRepository.findMaxDayOrderForUndone(userId, LocalDate.of(2026, 3, 23), 0))
                .thenReturn(-1);
        when(todoRepository.save(any(Todo.class))).thenAnswer(invocation -> invocation.getArgument(0));

        TodoService.ScheduleReviewResult result = todoService.scheduleReview(userId, todoId);

        assertThat(result.created()).isTrue();
        assertThat(result.item().getTitle()).isEqualTo("[복습 1회] 운영체제 정리");
    }

    @Test
    @DisplayName("scheduleReview: 원본이 삭제된 체인에서 prefix-only 제목도 그대로 유지한다")
    void scheduleReview_원본삭제_prefixOnly제목_그대로유지() {
        String userId = "c6d4ed5b-9d1e-4ecd-ac4f-9c1490f6fd01";
        String rootTodoId = "deleted-root";
        String todoId = "review-prefix-only";
        Todo reviewTodo = Todo.createReview(
                userId,
                rootTodoId,
                "[복습 1회]",
                null,
                LocalDate.of(2026, 3, 21),
                0,
                0,
                1
        );
        reviewTodo.updateDone(true);

        when(todoRepository.findByIdAndUserId(todoId, userId)).thenReturn(Optional.of(reviewTodo));
        when(todoRepository.findByUserIdAndOriginalTodoIdAndReviewRound(userId, rootTodoId, 2))
                .thenReturn(Optional.empty());
        when(todoRepository.findByIdAndUserId(rootTodoId, userId)).thenReturn(Optional.empty());
        when(todoRepository.findMaxDayOrderForUndone(userId, LocalDate.of(2026, 3, 23), 0))
                .thenReturn(-1);
        when(todoRepository.save(any(Todo.class))).thenAnswer(invocation -> invocation.getArgument(0));

        TodoService.ScheduleReviewResult result = todoService.scheduleReview(userId, todoId);

        assertThat(result.created()).isTrue();
        assertThat(result.item().getTitle()).isEqualTo("[복습 1회]");
    }

    @Test
    @DisplayName("scheduleReview: 늦게 눌러도 현재 Todo의 날짜 기준으로 다음 회차를 계산")
    void scheduleReview_늦게시작해도_todo날짜기준계산() {
        String userId = "c6d4ed5b-9d1e-4ecd-ac4f-9c1490f6fd01";
        String todoId = "todo-late";
        Todo todo = Todo.create(userId, "네트워크 정리", null, LocalDate.of(2026, 3, 21), 0, 0);
        todo.updateDone(true);

        when(todoRepository.findByIdAndUserId(todoId, userId)).thenReturn(Optional.of(todo));
        when(todoRepository.findByUserIdAndOriginalTodoIdAndReviewRound(userId, todo.getId(), 1))
                .thenReturn(Optional.empty());
        when(todoRepository.findMaxDayOrderForUndone(userId, LocalDate.of(2026, 3, 22), 0))
                .thenReturn(-1);
        when(todoRepository.save(any(Todo.class))).thenAnswer(invocation -> invocation.getArgument(0));

        TodoService.ScheduleReviewResult result = todoService.scheduleReview(userId, todoId);

        assertThat(result.created()).isTrue();
        assertThat(result.item().getDate()).isEqualTo(LocalDate.of(2026, 3, 22));
    }

    @Test
    @DisplayName("scheduleReview: unique 충돌이 나면 기존 Todo를 재조회해 반환")
    void scheduleReview_unique충돌_재조회반환() {
        String userId = "c6d4ed5b-9d1e-4ecd-ac4f-9c1490f6fd01";
        String todoId = "todo-1";
        Todo todo = Todo.create(userId, "제목", null, LocalDate.of(2026, 3, 21), 0, 0);
        todo.updateDone(true);
        Todo collided = Todo.createReview(
                userId,
                todo.getId(),
                "제목",
                null,
                LocalDate.of(2026, 3, 22),
                0,
                0,
                1
        );

        when(todoRepository.findByIdAndUserId(todoId, userId)).thenReturn(Optional.of(todo));
        when(todoRepository.findByUserIdAndOriginalTodoIdAndReviewRound(userId, todo.getId(), 1))
                .thenReturn(Optional.empty())
                .thenReturn(Optional.of(collided));
        when(todoRepository.findMaxDayOrderForUndone(userId, LocalDate.of(2026, 3, 22), 0))
                .thenReturn(-1);
        when(todoRepository.save(any(Todo.class)))
                .thenThrow(new DataIntegrityViolationException("duplicate key"));

        TodoService.ScheduleReviewResult result = todoService.scheduleReview(userId, todoId);

        assertThat(result.created()).isFalse();
        assertThat(result.item().getTitle()).isEqualTo("제목");
        verify(todoRepository, times(2))
                .findByUserIdAndOriginalTodoIdAndReviewRound(userId, todo.getId(), 1);
    }

    private TodoReorderRequest.Item reorderItem(String id, int dayOrder, int miniDay) {
        TodoReorderRequest.Item item = new TodoReorderRequest.Item();
        item.setId(id);
        item.setDayOrder(dayOrder);
        item.setMiniDay(miniDay);
        return item;
    }

}
