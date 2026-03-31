package kr.io.flowmate.todo.controller;

import jakarta.validation.Valid;
import kr.io.flowmate.common.dto.ListResponse;
import kr.io.flowmate.common.web.CurrentUser;
import kr.io.flowmate.todo.dto.request.TodoCreateRequest;
import kr.io.flowmate.todo.dto.request.TodoReorderRequest;
import kr.io.flowmate.todo.dto.response.TodoResponse;
import kr.io.flowmate.todo.dto.response.TodoScheduleReviewResponse;
import kr.io.flowmate.todo.dto.request.TodoUpdateRequest;
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

    @GetMapping
    public ResponseEntity<ListResponse<TodoResponse>> getTodos(
            @CurrentUser String userId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date
    ) {
        List<TodoResponse> todos = todoService.getTodos(userId, date);
        return ResponseEntity.ok(new ListResponse<>(todos));
    }

    @PostMapping
    public ResponseEntity<TodoResponse> createTodo(
            @CurrentUser String userId,
            @Valid @RequestBody TodoCreateRequest createRequest
    ) {
        TodoResponse todo = todoService.createTodo(userId, createRequest);
        return ResponseEntity.status(HttpStatus.CREATED).body(todo);
    }

    @PatchMapping("/{id}")
    public ResponseEntity<TodoResponse> updateTodo(
            @CurrentUser String userId,
            @PathVariable String id,
            @Valid @RequestBody TodoUpdateRequest updateRequest
    ) {
        TodoResponse todo = todoService.updateTodo(userId, id, updateRequest);
        return ResponseEntity.ok(todo);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteTodo(
            @CurrentUser String userId,
            @PathVariable String id
    ) {
        todoService.deleteTodo(userId, id);
        return ResponseEntity.noContent().build();
    }

    @PutMapping("/reorder")
    public ResponseEntity<ListResponse<TodoResponse>> reorderTodos(
            @CurrentUser String userId,
            @Valid @RequestBody TodoReorderRequest reorderRequest
    ) {
        List<TodoResponse> todos = todoService.reorderTodos(userId, reorderRequest);
        return ResponseEntity.ok(new ListResponse<>(todos));
    }

    @PostMapping("/{id}/review-schedule")
    public ResponseEntity<TodoScheduleReviewResponse> scheduleReview(
            @CurrentUser String userId,
            @PathVariable String id
    ) {
        TodoService.ScheduleReviewResult result = todoService.scheduleReview(userId, id);
        HttpStatus status = result.created() ? HttpStatus.CREATED : HttpStatus.OK;
        return ResponseEntity.status(status)
                .body(new TodoScheduleReviewResponse(result.item(), result.created()));
    }
}
