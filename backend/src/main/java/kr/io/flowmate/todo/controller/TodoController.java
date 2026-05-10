package kr.io.flowmate.todo.controller;

import jakarta.validation.Valid;
import kr.io.flowmate.common.annotation.CurrentUser;
import kr.io.flowmate.common.dto.ListResponse;
import kr.io.flowmate.todo.dto.request.TodoCreateRequest;
import kr.io.flowmate.todo.dto.request.TodoReorderRequest;
import kr.io.flowmate.todo.dto.request.TodoUpdateRequest;
import kr.io.flowmate.todo.dto.response.TodoResponse;
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

    /**
     * Todo 목록 조회
     * - GET /api/todos
     * - GET /api/todos?date=yyyy-MM-dd
     * - GET /api/todos?from=yyyy-MM-dd&to=yyyy-MM-dd
     */
    @GetMapping
    public ResponseEntity<ListResponse<TodoResponse>> getTodos(
            @CurrentUser String userId,
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to
    ) {
        List<TodoResponse> todos = todoService.getTodos(userId, date, from, to);
        return ResponseEntity.ok(new ListResponse<>(todos));
    }

    /**
     * Todo 생성
     * - POST /api/todos
     */
    @PostMapping
    public ResponseEntity<TodoResponse> createTodo(
            @CurrentUser String userId,
            @Valid
            @RequestBody TodoCreateRequest createRequest
    ) {
        TodoResponse todo = todoService.createTodo(userId, createRequest);
        return ResponseEntity.status(HttpStatus.CREATED).body(todo);
    }

    /**
     * Todo 수정
     * - PATCH /api/todos/{id}
     */
    @PatchMapping("/{id}")
    public ResponseEntity<TodoResponse> updateTodo(
            @CurrentUser String userId,
            @PathVariable String id,
            @Valid
            @RequestBody TodoUpdateRequest updateRequest
    ) {
        TodoResponse todo = todoService.updateTodo(userId, id, updateRequest);
        return ResponseEntity.ok(todo);
    }

    /**
     * Todo 삭제
     * DELETE /api/todos/{id}
     */
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteTodo(
            @CurrentUser String userId,
            @PathVariable String id
    ) {
        todoService.deleteTodo(userId, id);
        return ResponseEntity.noContent().build();
    }

    /**
     * Todo 순서 변경
     * - PUT /api/todos/reorder
     */
    @PutMapping("/reorder")
    public ResponseEntity<ListResponse<TodoResponse>> reorderTodos(
            @CurrentUser String userId,
            @Valid @RequestBody TodoReorderRequest reorderRequest
    ) {
        List<TodoResponse> todos = todoService.reorderTodos(userId, reorderRequest);
        return ResponseEntity.ok(new ListResponse<>(todos));
    }

}
