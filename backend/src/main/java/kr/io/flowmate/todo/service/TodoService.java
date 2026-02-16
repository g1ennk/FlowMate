package kr.io.flowmate.todo.service;

import kr.io.flowmate.todo.domain.TimerMode;
import kr.io.flowmate.todo.domain.Todo;
import kr.io.flowmate.todo.dto.TodoCreateRequest;
import kr.io.flowmate.todo.dto.TodoReorderRequest;
import kr.io.flowmate.todo.dto.TodoResponse;
import kr.io.flowmate.todo.dto.TodoUpdateRequest;
import kr.io.flowmate.todo.exception.TodoNotFoundException;
import kr.io.flowmate.todo.repository.TodoRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;

@Service
@Transactional(readOnly = true) // 서비스 클래스에 readOnly를 붙이고, 쓰기 메서드에만 따로 @Tractional을 붙이는 패턴
@RequiredArgsConstructor // 생성자 주입
public class TodoService {

    private final TodoRepository todoRepository;

    /**
     * Todo 목록 조회
     * - date가 null이면 전체 조회, 있으면 특정 날짜만 조회
     */
    public List<TodoResponse> getTodos(String userId, LocalDate date) {

        List<Todo> todos;

        // 전체 조회
        if (date == null) {
            todos = todoRepository.findAllByUserIdOrderByDateAscMiniDayAscDayOrderAscCreatedAtAsc(userId);
        }
        // 특정 날짜 조회
        else {
            todos = todoRepository.findAllByUserIdAndDateOrderByMiniDayAscDayOrderAscCreatedAtAsc(userId, date);
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

        // null이 아닌 필드만 수정
        if (request.getTitle() != null) {
            todo.updateTitle(request.getTitle());
        }

        // note는 명시적으로 제공되면 업데이트 (null 포함)
        if (request.hasNote()) {
            todo.updateNote(request.getNote());
        }

        if (request.getIsDone() != null) {
            todo.updateDone(request.getIsDone());
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
        // 각 Todo의 순서 업데이트
        for (TodoReorderRequest.Item item : request.getItems()) {
            Todo todo = findTodoByIdAndUserId(item.getId(), userId);

            todo.updateDayOrder(item.getDayOrder());
            todo.updateMiniDay(item.getMiniDay());
        }

        // 전체 목록 조회하여 다시 반환
        List<Todo> allTodos = todoRepository
                .findAllByUserIdOrderByDateAscMiniDayAscDayOrderAscCreatedAtAsc(userId);
        return allTodos.stream()
                .map(TodoResponse::from)
                .toList();
    }

    /**
     * Todo 조회 (내부 메서드)
     */
    private Todo findTodoByIdAndUserId(String todoId, String userId) {
        return todoRepository.findByIdAndUserId(todoId, userId)
                .orElseThrow(() -> new TodoNotFoundException(todoId));
    }

}
