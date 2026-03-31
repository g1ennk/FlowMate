package kr.io.flowmate.todo.service;

import kr.io.flowmate.todo.domain.TimerMode;
import kr.io.flowmate.todo.domain.Todo;
import kr.io.flowmate.todo.dto.request.TodoCreateRequest;
import kr.io.flowmate.todo.dto.request.TodoReorderRequest;
import kr.io.flowmate.todo.dto.response.TodoResponse;
import kr.io.flowmate.todo.dto.request.TodoUpdateRequest;
import kr.io.flowmate.todo.exception.TodoNotFoundException;
import kr.io.flowmate.todo.repository.TodoRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@Transactional(readOnly = true) // 서비스 클래스에 readOnly를 붙이고, 쓰기 메서드에만 따로 @Tractional을 붙이는 패턴
@RequiredArgsConstructor // 생성자 주입
public class TodoService {

    private static final int[] REVIEW_INTERVALS = {1, 2, 4, 8, 16, 32};
    private static final int MAX_REVIEW_ROUND = 6;
    private final TodoRepository todoRepository;

    /**
     * Todo 목록 조회
     * - date가 null이면 전체 조회, 있으면 특정 날짜만 조회
     */
    public List<TodoResponse> getTodos(String userId, LocalDate date) {

        List<Todo> todos;

        if (date == null) {
            todos = todoRepository.findAllByUserId(userId);
        } else {
            todos = todoRepository.findAllByUserIdAndDate(userId, date);
        }

        // 조회된 엔티티 목록을 전부 순회하면서, 각 응답 DTO로 변환하여 리스트로 만들어 반환한다.
        return todos.stream()
                .map(TodoResponse::from)
                .toList();
    }

    /**
     * Todo 생성
     * - 프론트엔드가 전달한 date, miniDay, dayOrder를 그대로 사용한다.
     */
    @Transactional
    public TodoResponse createTodo(String userId, TodoCreateRequest request) {
        // 프론트엔드가 모든 필드를 항상 전달
        LocalDate date = request.getDate();
        int miniDay = request.getMiniDay();
        int dayOrder = request.getDayOrder();

        // Todo 생성
        Todo todo = Todo.create(
                userId,
                request.getTitle(),
                request.getNote(),
                date,
                miniDay,
                dayOrder
        );

        Todo saved = todoRepository.save(todo);
        return TodoResponse.from(saved);
    }

    /**
     * Todo 수정
     * - null이 아닌 필드만 수정
     * - note는 명시적으로 null을 전달하면 삭제 (빈 문자열이 아닌 실제 null)
     * - Dirty Checking을 통해 자동으로 UPDATE 쿼리 실행
     */
    @Transactional
    public TodoResponse updateTodo(String userId, String todoId, TodoUpdateRequest request) {
        Todo todo = findTodoByIdAndUserId(todoId, userId);

        // null이 아닌 필드만 수정 (null = 변경 안 함, blank = 거부)
        if (request.getTitle() != null) {
            if (request.getTitle().isBlank()) {
                throw new IllegalArgumentException("title must not be blank");
            }
            todo.updateTitle(request.getTitle());
        }

        // note는 명시적으로 제공되면 업데이트 (null 포함)
        if (request.hasNote()) {
            todo.updateNote(request.getNote());
        }

        if (request.getIsDone() != null) {
            todo.updateDone(request.getIsDone());
        }

        // 태스크 이동 계열 액션은 같은 Todo를 유지하고 date/dayOrder만 갱신한다.
        if (request.getDate() != null) {
            todo.updateDate(request.getDate());
        }

        if (request.getMiniDay() != null) {
            todo.updateMiniDay(request.getMiniDay());
        }

        if (request.getDayOrder() != null) {
            todo.updateDayOrder(request.getDayOrder());
        }

        if (request.hasTimerMode()) {
            String raw = request.getTimerMode();
            TimerMode timerMode = (raw == null || raw.isBlank()) ? null : TimerMode.fromValue(raw);
            todo.updateTimerMode(timerMode);
        }

        return TodoResponse.from(todo);
    }

    /**
     * Todo 삭제
     */
    @Transactional
    public void deleteTodo(String userId, String todoId) {
        Todo todo = findTodoByIdAndUserId(todoId, userId);
        todoRepository.delete(todo);
    }

    /**
     * Todo 순서 변경
     * - 여러 Todo의 miniDay, dayOrder를 일괄 수정
     */
    @Transactional
    public List<TodoResponse> reorderTodos(String userId, TodoReorderRequest request) {
        // bulk 조회로 N+1 방지
        List<String> ids = request.getItems().stream()
                .map(TodoReorderRequest.Item::getId).toList();
        Map<String, Todo> todoMap = todoRepository.findAllByIdInAndUserId(ids, userId).stream()
                .collect(Collectors.toMap(Todo::getId, Function.identity()));

        for (TodoReorderRequest.Item item : request.getItems()) {
            Todo todo = todoMap.get(item.getId());
            if (todo == null) throw new TodoNotFoundException(item.getId());
            todo.updateDayOrder(item.getDayOrder());
            todo.updateMiniDay(item.getMiniDay());
        }

        return todoRepository.findAllByUserId(userId).stream()
                .map(TodoResponse::from)
                .toList();
    }

    @Transactional
    public ScheduleReviewResult scheduleReview(String userId, String todoId) {
        Todo todo = findTodoByIdAndUserId(todoId, userId);

        if (!todo.isDone()) {
            throw new IllegalArgumentException("완료된 Todo만 복습 등록할 수 있습니다");
        }

        int currentRound = todo.getReviewRound() != null ? todo.getReviewRound() : 0;
        if (currentRound >= MAX_REVIEW_ROUND) {
            throw new IllegalArgumentException("복습이 모두 완료된 Todo입니다");
        }

        int nextRound = currentRound + 1;
        String rootTodoId = todo.getOriginalTodoId() != null ? todo.getOriginalTodoId() : todo.getId();

        Todo existing = todoRepository
                .findByUserIdAndOriginalTodoIdAndReviewRound(userId, rootTodoId, nextRound)
                .orElse(null);
        if (existing != null) {
            return new ScheduleReviewResult(TodoResponse.from(existing), false);
        }

        LocalDate nextDate = todo.getDate().plusDays(REVIEW_INTERVALS[currentRound]);
        int nextDayOrder = todoRepository.findMaxDayOrderForUndone(userId, nextDate, 0) + 1;

        Todo reviewTodo = Todo.createReview(
                userId,
                rootTodoId,
                resolveBaseTitle(userId, todo, rootTodoId),
                todo.getNote(),
                nextDate,
                0,
                nextDayOrder,
                nextRound
        );

        try {
            Todo saved = todoRepository.save(reviewTodo);
            return new ScheduleReviewResult(TodoResponse.from(saved), true);
        } catch (DataIntegrityViolationException ex) {
            Todo collided = todoRepository
                    .findByUserIdAndOriginalTodoIdAndReviewRound(userId, rootTodoId, nextRound)
                    .orElseThrow(() -> ex);
            return new ScheduleReviewResult(TodoResponse.from(collided), false);
        }
    }

    /**
     * Todo 조회 (내부 메서드)
     */
    private Todo findTodoByIdAndUserId(String todoId, String userId) {
        return todoRepository.findByIdAndUserId(todoId, userId)
                .orElseThrow(() -> new TodoNotFoundException(todoId));
    }

    private String resolveBaseTitle(String userId, Todo sourceTodo, String rootTodoId) {
        if (sourceTodo.getOriginalTodoId() == null) {
            return sourceTodo.getTitle();
        }

        return todoRepository.findByIdAndUserId(rootTodoId, userId)
                .map(Todo::getTitle)
                .orElseGet(sourceTodo::getTitle);
    }

    public record ScheduleReviewResult(TodoResponse item, boolean created) {
    }

}
