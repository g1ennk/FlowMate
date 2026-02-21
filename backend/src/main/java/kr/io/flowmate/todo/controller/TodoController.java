package kr.io.flowmate.todo.controller;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import kr.io.flowmate.common.dto.ListResponse;
import kr.io.flowmate.common.util.ClientIdResolver;
import kr.io.flowmate.todo.dto.TodoCreateRequest;
import kr.io.flowmate.todo.dto.TodoReorderRequest;
import kr.io.flowmate.todo.dto.TodoResponse;
import kr.io.flowmate.todo.dto.TodoUpdateRequest;
import kr.io.flowmate.todo.service.TodoService;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/todos")
@RequiredArgsConstructor
public class TodoController {

    private final TodoService todoService;
    private final ClientIdResolver clientIdResolver;

    /**
     * Todo 목록 조회
     * - GET /api/todos
     * - GET /api/todos?date=yyyy-MM-dd
     */
    @GetMapping
    public ResponseEntity<ListResponse<TodoResponse>> getTodos(
            HttpServletRequest request,
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date
    ) {
        String userId = clientIdResolver.resolve(request);
        List<TodoResponse> todos = todoService.getTodos(userId, date);
        return ResponseEntity.ok(new ListResponse<>(todos));
    }

    /**
     * Todo 생성
     * - POST /api/todos
     */
    @PostMapping
    public ResponseEntity<TodoResponse> createTodo(
            HttpServletRequest request,
            @Valid
            @RequestBody TodoCreateRequest createRequest
    ) {
        String userId = clientIdResolver.resolve(request);
        TodoResponse todo = todoService.createTodo(userId, createRequest);
        return ResponseEntity.status(HttpStatus.CREATED).body(todo);
    }

    /**
     * Todo 수정
     * - PATCH /api/todos/{id}
     */
    @PatchMapping("/{id}")
    public ResponseEntity<TodoResponse> updateTodo(
            HttpServletRequest request,
            @PathVariable String id,
            @Valid
            @RequestBody TodoUpdateRequest updateRequest
    ) {
        String userId = clientIdResolver.resolve(request);
        TodoResponse todo = todoService.updateTodo(userId, id, updateRequest);
        return ResponseEntity.ok(todo);
    }

    /**
     * Todo 삭제
     * DELETE /api/todos/{id}
     */
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteTodo(
            HttpServletRequest request,
            @PathVariable String id
    ) {
        String userId = clientIdResolver.resolve(request);
        todoService.deleteTodo(userId, id);
        return ResponseEntity.noContent().build();
    }

    /**
     * Todo 순서 변경
     * - PUT /api/todos/reorder
     */
    @PutMapping("/reorder")
    public ResponseEntity<ListResponse<TodoResponse>> reorderTodos(
            HttpServletRequest request,
            @Valid @RequestBody TodoReorderRequest reorderRequest
    ) {
        String userId = clientIdResolver.resolve(request);
        List<TodoResponse> todos = todoService.reorderTodos(userId, reorderRequest);
        return ResponseEntity.ok(new ListResponse<>(todos));
    }

}





















