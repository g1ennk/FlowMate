package kr.io.flowmate.todo.service;

import kr.io.flowmate.todo.domain.Todo;
import kr.io.flowmate.todo.dto.request.TodoCreateRequest;
import kr.io.flowmate.todo.dto.request.TodoReorderRequest;
import kr.io.flowmate.todo.dto.response.TodoResponse;
import kr.io.flowmate.todo.dto.request.TodoUpdateRequest;
import kr.io.flowmate.todo.exception.TodoNotFoundException;
import kr.io.flowmate.todo.repository.TodoRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
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
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("TodoService")
class TodoServiceTest {

    @Mock
    private TodoRepository todoRepository;

    @InjectMocks
    private TodoService todoService;

    private static final String USER_ID = "user-1";
    private static final LocalDate TODAY = LocalDate.of(2026, 3, 28);

    // ===========================================
    @Nested
    @DisplayName("getTodos")
    class GetTodos {
        @Test
        @DisplayName("getTodos: date 없으면 전체 조회")
        void getTodos_noDate_returnsAll() {
            // given
            List<Todo> todos = List.of(
                    Todo.create(USER_ID, "A", null, TODAY, 0, 0),
                    Todo.create(USER_ID, "B", null, TODAY, 1, 1)
            );
            when(todoRepository.findAllByUserId(USER_ID)).thenReturn(todos);

            // when
            List<TodoResponse> result = todoService.getTodos(USER_ID, null);

            // then
            assertThat(result).hasSize(2);
            verify(todoRepository).findAllByUserId(USER_ID);
        }

        @Test
        @DisplayName("getTodos: date 지정 시 해당 날짜만 반환")
        void getTodos_withDate_returnsFiltered() {
            // given
            List<Todo> todos = List.of(Todo.create(USER_ID, "A", null, TODAY, 0, 0));
            when(todoRepository.findAllByUserIdAndDate(USER_ID, TODAY)).thenReturn(todos);

            // when
            List<TodoResponse> result = todoService.getTodos(USER_ID, TODAY);

            // then
            assertThat(result).hasSize(1);
            verify(todoRepository).findAllByUserIdAndDate(USER_ID, TODAY);
        }
    }

    // ===========================================
    @Nested
    @DisplayName("createTodo")
    class CreateTodo {
        @Test
        @DisplayName("createTodo: 모든 필드 → 정상 저장")
        void createTodo_allFields_saveSuccessfully() {
            // given
            TodoCreateRequest req = new TodoCreateRequest();
            req.setTitle("할 일");
            req.setNote("메모");
            req.setDate(TODAY);
            req.setMiniDay(1);
            req.setDayOrder(0);
            when(todoRepository.save(any(Todo.class))).thenAnswer(inv -> inv.getArgument(0));

            // when
            TodoResponse result = todoService.createTodo(USER_ID, req);

            // then
            assertThat(result.title()).isEqualTo("할 일");
            assertThat(result.note()).isEqualTo("메모");
            assertThat(result.date()).isEqualTo(TODAY);
            assertThat(result.miniDay()).isEqualTo(1);
        }
    }

    // ===========================================
    @Nested
    @DisplayName("updateTodo")
    class UpdateTodo {
        @Test
        @DisplayName("updateTodo: 제공된 필드만 수정, 나머지 유지")
        void updateTodo_partialUpdate_onlyChangesProvidedFields() {
            // given
            Todo todo = Todo.create(USER_ID, "원래 제목", "원래 메모", TODAY, 0, 0);
            when(todoRepository.findByIdAndUserId(any(), eq(USER_ID))).thenReturn(Optional.of(todo));

            TodoUpdateRequest req = new TodoUpdateRequest();
            req.setTitle("새 제목");

            // when
            TodoResponse result = todoService.updateTodo(USER_ID, "todo-1", req);

            // then
            assertThat(result.title()).isEqualTo("새 제목");
            assertThat(result.note()).isEqualTo("원래 메모");
        }

        @Test
        @DisplayName("updateTodo: note를 명시적 null로 전달 → 삭제")
        void updateTodo_noteExplicitNull_deletesNote() {
            // given
            Todo todo = Todo.create(USER_ID, "제목", "메모 있음", TODAY, 0, 0);
            when(todoRepository.findByIdAndUserId(any(), eq(USER_ID))).thenReturn(Optional.of(todo));

            TodoUpdateRequest req = new TodoUpdateRequest();
            req.setNote(null); // noteProvided=true가 됨

            // when
            TodoResponse result = todoService.updateTodo(USER_ID, "todo-1", req);

            // then
            assertThat(result.note()).isNull();
        }

        @Test
        @DisplayName("updateTodo: date 변경 시 기존 세션 집계/timerMode 유지")
        void updateTodo_dateChange_preservesSessionData() {
            // given
            Todo todo = Todo.create(USER_ID, "제목", null, TODAY, 0, 0);
            todo.incrementSessionCount();
            todo.addSessionFocusSeconds(1500);
            when(todoRepository.findByIdAndUserId(any(), eq(USER_ID))).thenReturn(Optional.of(todo));

            TodoUpdateRequest req = new TodoUpdateRequest();
            req.setDate(TODAY.plusDays(1));

            // when
            TodoResponse result = todoService.updateTodo(USER_ID, "todo-1", req);

            // then
            assertThat(result.date()).isEqualTo(TODAY.plusDays(1));
            assertThat(result.sessionCount()).isEqualTo(1);
            assertThat(result.sessionFocusSeconds()).isEqualTo(1500);
        }

        @ParameterizedTest
        @NullSource
        @ValueSource(strings = {"", "   "})
        @DisplayName("updateTodo: timerMode null/blank → null로 처리")
        void updateTodo_timerModeNullOrBlank_setsNull(String value) {
            // given
            Todo todo = Todo.create(USER_ID, "제목", null, TODAY, 0, 0);
            when(todoRepository.findByIdAndUserId(any(), eq(USER_ID))).thenReturn(Optional.of(todo));

            TodoUpdateRequest req = new TodoUpdateRequest();
            req.setTimerMode(value);

            // when
            TodoResponse result = todoService.updateTodo(USER_ID, "todo-1", req);

            // then
            assertThat(result.timerMode()).isNull();
        }

        @Test
        @DisplayName("updateTodo: timerMode pomodoro 반영")
        void updateTodo_timerModePomodoro_sets() {
            // given
            Todo todo = Todo.create(USER_ID, "제목", null, TODAY, 0, 0);
            when(todoRepository.findByIdAndUserId(any(), eq(USER_ID))).thenReturn(Optional.of(todo));

            TodoUpdateRequest req = new TodoUpdateRequest();
            req.setTimerMode("pomodoro");

            // when
            TodoResponse result = todoService.updateTodo(USER_ID, "todo-1", req);

            // then
            assertThat(result.timerMode()).isEqualTo("pomodoro");
        }

        @Test
        @DisplayName("updateTodo: todo 미존재 → TodoNotFoundException")
        void updateTodo_notFound_throwsException() {
            // given
            when(todoRepository.findByIdAndUserId(any(), eq(USER_ID))).thenReturn(Optional.empty());

            // when & then
            assertThatThrownBy(() -> todoService.updateTodo(USER_ID, "없는id", new TodoUpdateRequest()))
                    .isInstanceOf(TodoNotFoundException.class);
        }

        @Test
        @DisplayName("updateTodo: title blank → IllegalArgumentException")
        void updateTodo_blankTitle_throwsException() {
            // given
            Todo todo = Todo.create(USER_ID, "제목", null, TODAY, 0, 0);
            when(todoRepository.findByIdAndUserId(any(), eq(USER_ID))).thenReturn(Optional.of(todo));

            TodoUpdateRequest req = new TodoUpdateRequest();
            req.setTitle("   ");

            // when & then
            assertThatThrownBy(() -> todoService.updateTodo(USER_ID, "todo-1", req))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("title");
        }
    }

    // ===========================================
    @Nested
    @DisplayName("deleteTodo")
    class DeleteTodo {
        @Test
        @DisplayName("deleteTodo: 정상 삭제")
        void deleteTodo_exists_deletesSuccessfully() {
            // given
            Todo todo = Todo.create(USER_ID, "제목", null, TODAY, 0, 0);
            when(todoRepository.findByIdAndUserId("todo-1", USER_ID)).thenReturn(Optional.of(todo));

            // when
            todoService.deleteTodo(USER_ID, "todo-1");

            // then
            verify(todoRepository).delete(todo);
        }

        @Test
        @DisplayName("deleteTodo: 미존재 → TodoNotFoundException")
        void deleteTodo_notFound_throwsException() {
            // given
            when(todoRepository.findByIdAndUserId(any(), eq(USER_ID))).thenReturn(Optional.empty());

            // when & then
            assertThatThrownBy(() -> todoService.deleteTodo(USER_ID, "없는id"))
                    .isInstanceOf(TodoNotFoundException.class);
        }
    }

    // ===========================================
    @Nested
    @DisplayName("reorderTodos")
    class ReorderTodos {
        @Test
        @DisplayName("reorderTodos: bulk 조회 후 순서/섹션 갱신")
        void reorderTodos_updatesOrderAndSection() {
            // given
            Todo todo1 = Todo.create(USER_ID, "A", null, TODAY, 0, 0);
            Todo todo2 = Todo.create(USER_ID, "B", null, TODAY, 0, 1);
            when(todoRepository.findAllByIdInAndUserId(any(), eq(USER_ID)))
                    .thenReturn(List.of(todo1, todo2));
            when(todoRepository.findAllByUserId(USER_ID)).thenReturn(List.of(todo1, todo2));

            TodoReorderRequest req = new TodoReorderRequest();
            TodoReorderRequest.Item item1 = new TodoReorderRequest.Item();
            item1.setId(todo1.getId());
            item1.setDayOrder(1);
            item1.setMiniDay(2);
            TodoReorderRequest.Item item2 = new TodoReorderRequest.Item();
            item2.setId(todo2.getId());
            item2.setDayOrder(0);
            item2.setMiniDay(2);
            req.setItems(List.of(item1, item2));

            // when
            List<TodoResponse> result = todoService.reorderTodos(USER_ID, req);

            // then
            assertThat(result).hasSize(2);
            assertThat(todo1.getDayOrder()).isEqualTo(1);
            assertThat(todo1.getMiniDay()).isEqualTo(2);
            verify(todoRepository).findAllByIdInAndUserId(any(), eq(USER_ID));
        }

        @Test
        @DisplayName("reorderTodos: 일부 todoId 미존재 → TodoNotFoundException")
        void reorderTodos_someNotFound_throwsException() {
            // given
            when(todoRepository.findAllByIdInAndUserId(any(), eq(USER_ID)))
                    .thenReturn(List.of()); // 빈 결과

            TodoReorderRequest req = new TodoReorderRequest();
            TodoReorderRequest.Item item = new TodoReorderRequest.Item();
            item.setId("없는id");
            item.setDayOrder(0);
            item.setMiniDay(0);
            req.setItems(List.of(item));

            // when & then
            assertThatThrownBy(() -> todoService.reorderTodos(USER_ID, req))
                    .isInstanceOf(TodoNotFoundException.class);
        }
    }

    // ===========================================
    @Nested
    @DisplayName("scheduleReview")
    class ScheduleReview {
        @Test
        @DisplayName("scheduleReview: 완료된 일반 Todo → 1회차 복습 생성")
        void scheduleReview_completedOriginal_createsRound1() {
            // given
            Todo todo = Todo.create(USER_ID, "공부", null, TODAY, 0, 0);
            todo.updateDone(true);
            when(todoRepository.findByIdAndUserId(any(), eq(USER_ID))).thenReturn(Optional.of(todo));
            when(todoRepository.findByUserIdAndOriginalTodoIdAndReviewRound(USER_ID, todo.getId(), 1))
                    .thenReturn(Optional.empty());
            when(todoRepository.findMaxDayOrderForUndone(eq(USER_ID), any(), eq(0))).thenReturn(-1);
            when(todoRepository.save(any(Todo.class))).thenAnswer(inv -> inv.getArgument(0));

            // when
            TodoService.ScheduleReviewResult result = todoService.scheduleReview(USER_ID, todo.getId());

            // then
            assertThat(result.created()).isTrue();
            assertThat(result.item().reviewRound()).isEqualTo(1);
            assertThat(result.item().date()).isEqualTo(TODAY.plusDays(1));
        }

        @Test
        @DisplayName("scheduleReview: 복습 Todo → 다음 회차 생성 (2→4일 간격)")
        void scheduleReview_reviewTodo_createsNextRound() {
            // given
            Todo reviewTodo = Todo.createReview(USER_ID, "root-id", "공부", null, TODAY, 0, 0, 1);
            reviewTodo.updateDone(true);
            when(todoRepository.findByIdAndUserId(any(), eq(USER_ID))).thenReturn(Optional.of(reviewTodo));
            when(todoRepository.findByUserIdAndOriginalTodoIdAndReviewRound(USER_ID, "root-id", 2))
                    .thenReturn(Optional.empty());
            when(todoRepository.findMaxDayOrderForUndone(eq(USER_ID), any(), eq(0))).thenReturn(-1);
            when(todoRepository.save(any(Todo.class))).thenAnswer(inv -> inv.getArgument(0));

            // when
            TodoService.ScheduleReviewResult result = todoService.scheduleReview(USER_ID, reviewTodo.getId());

            // then
            assertThat(result.created()).isTrue();
            assertThat(result.item().reviewRound()).isEqualTo(2);
            assertThat(result.item().date()).isEqualTo(TODAY.plusDays(2));
        }

        @Test
        @DisplayName("scheduleReview: 미완료 Todo → IllegalArgumentException")
        void scheduleReview_notDone_throwsException() {
            // given
            Todo todo = Todo.create(USER_ID, "공부", null, TODAY, 0, 0);
            when(todoRepository.findByIdAndUserId(any(), eq(USER_ID))).thenReturn(Optional.of(todo));

            // when & then
            assertThatThrownBy(() -> todoService.scheduleReview(USER_ID, todo.getId()))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("완료된 Todo만");
        }

        @Test
        @DisplayName("scheduleReview: 6회차 완료 → IllegalArgumentException")
        void scheduleReview_maxRound_throwsException() {
            // given
            Todo todo = Todo.createReview(USER_ID, "root-id", "공부", null, TODAY, 0, 0, 6);
            todo.updateDone(true);
            when(todoRepository.findByIdAndUserId(any(), eq(USER_ID))).thenReturn(Optional.of(todo));

            // when & then
            assertThatThrownBy(() -> todoService.scheduleReview(USER_ID, todo.getId()))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("모두 완료");
        }

        @Test
        @DisplayName("scheduleReview: 동일 회차 이미 존재 → 기존 반환 (created=false, never save)")
        void scheduleReview_alreadyExists_returnsExisting() {
            // given
            Todo todo = Todo.create(USER_ID, "공부", null, TODAY, 0, 0);
            todo.updateDone(true);
            when(todoRepository.findByIdAndUserId(any(), eq(USER_ID))).thenReturn(Optional.of(todo));

            Todo existing = Todo.createReview(USER_ID, todo.getId(), "공부", null, TODAY.plusDays(1), 0, 0, 1);
            when(todoRepository.findByUserIdAndOriginalTodoIdAndReviewRound(USER_ID, todo.getId(), 1))
                    .thenReturn(Optional.of(existing));

            // when
            TodoService.ScheduleReviewResult result = todoService.scheduleReview(USER_ID, todo.getId());

            // then
            assertThat(result.created()).isFalse();
            verify(todoRepository, never()).save(any());
        }

        @Test
        @DisplayName("scheduleReview: unique 충돌 → 재조회 후 반환")
        void scheduleReview_uniqueConflict_queriesAgainAndReturns() {
            // given
            Todo todo = Todo.create(USER_ID, "공부", null, TODAY, 0, 0);
            todo.updateDone(true);
            when(todoRepository.findByIdAndUserId(any(), eq(USER_ID))).thenReturn(Optional.of(todo));
            when(todoRepository.findByUserIdAndOriginalTodoIdAndReviewRound(USER_ID, todo.getId(), 1))
                    .thenReturn(Optional.empty())
                    .thenReturn(Optional.of(Todo.createReview(USER_ID, todo.getId(), "공부", null, TODAY.plusDays(1), 0, 0, 1)));
            when(todoRepository.findMaxDayOrderForUndone(eq(USER_ID), any(), eq(0))).thenReturn(-1);
            when(todoRepository.save(any())).thenThrow(new DataIntegrityViolationException("unique"));

            // when
            TodoService.ScheduleReviewResult result = todoService.scheduleReview(USER_ID, todo.getId());

            // then
            assertThat(result.created()).isFalse();
        }

        @Test
        @DisplayName("scheduleReview: 원본 삭제된 체인 → 현재 제목 기준 생성")
        void scheduleReview_deletedRoot_usesCurrentTitle() {
            // given
            Todo reviewTodo = Todo.createReview(USER_ID, "deleted-root", "원래 제목", null, TODAY, 0, 0, 1);
            reviewTodo.updateDone(true);
            when(todoRepository.findByIdAndUserId(any(), eq(USER_ID))).thenReturn(Optional.of(reviewTodo));
            when(todoRepository.findByUserIdAndOriginalTodoIdAndReviewRound(USER_ID, "deleted-root", 2))
                    .thenReturn(Optional.empty());
            when(todoRepository.findMaxDayOrderForUndone(eq(USER_ID), any(), eq(0))).thenReturn(-1);
            // root가 삭제됨
            when(todoRepository.findByIdAndUserId("deleted-root", USER_ID)).thenReturn(Optional.empty());
            when(todoRepository.save(any(Todo.class))).thenAnswer(inv -> inv.getArgument(0));

            // when
            TodoService.ScheduleReviewResult result = todoService.scheduleReview(USER_ID, reviewTodo.getId());

            // then
            assertThat(result.item().title()).isEqualTo("원래 제목");
        }

        @Test
        @DisplayName("scheduleReview: todo 날짜 기준으로 복습 날짜 계산 (현재 날짜 아님)")
        void scheduleReview_calculatesFromTodoDate_notToday() {
            // given
            LocalDate pastDate = LocalDate.of(2026, 3, 1);
            Todo todo = Todo.create(USER_ID, "공부", null, pastDate, 0, 0);
            todo.updateDone(true);
            when(todoRepository.findByIdAndUserId(any(), eq(USER_ID))).thenReturn(Optional.of(todo));
            when(todoRepository.findByUserIdAndOriginalTodoIdAndReviewRound(USER_ID, todo.getId(), 1))
                    .thenReturn(Optional.empty());
            when(todoRepository.findMaxDayOrderForUndone(eq(USER_ID), any(), eq(0))).thenReturn(-1);
            when(todoRepository.save(any(Todo.class))).thenAnswer(inv -> inv.getArgument(0));

            // when
            TodoService.ScheduleReviewResult result = todoService.scheduleReview(USER_ID, todo.getId());

            // then
            assertThat(result.item().date()).isEqualTo(pastDate.plusDays(1));
        }
    }
}
