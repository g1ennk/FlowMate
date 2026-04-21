package kr.io.flowmate.todo.controller;

import kr.io.flowmate.common.util.CurrentUserResolver;
import kr.io.flowmate.common.web.GlobalExceptionHandler;
import kr.io.flowmate.todo.dto.response.TodoResponse;
import kr.io.flowmate.todo.dto.response.TodoScheduleReviewResponse;
import kr.io.flowmate.todo.service.TodoService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
@DisplayName("TodoController")
class TodoControllerTest {

    @Mock private TodoService todoService;
    @Mock private CurrentUserResolver currentUserResolver;

    @InjectMocks
    private TodoController todoController;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(todoController)
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    @DisplayName("scheduleReview: 신규 복습 등록(created=true)은 201 CREATED")
    void scheduleReview_created_returns201() throws Exception {
        String todoId = UUID.randomUUID().toString();
        when(currentUserResolver.resolve()).thenReturn("user-1");
        when(todoService.scheduleReview("user-1", todoId))
                .thenReturn(new TodoScheduleReviewResponse(sampleResponse(todoId), true));

        mockMvc.perform(post("/api/todos/{id}/review-schedule", todoId))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.created").value(true));
    }

    @Test
    @DisplayName("scheduleReview: 이미 등록된 경우(created=false)는 200 OK")
    void scheduleReview_existing_returns200() throws Exception {
        String todoId = UUID.randomUUID().toString();
        when(currentUserResolver.resolve()).thenReturn("user-1");
        when(todoService.scheduleReview("user-1", todoId))
                .thenReturn(new TodoScheduleReviewResponse(sampleResponse(todoId), false));

        mockMvc.perform(post("/api/todos/{id}/review-schedule", todoId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.created").value(false));
    }

    @Test
    @DisplayName("getTodos: 응답 JSON의 boolean 키는 `isDone` (Jackson record 직렬화 검증, `done`이 아님)")
    void getTodos_serializesIsDoneKey() throws Exception {
        when(currentUserResolver.resolve()).thenReturn("user-1");
        when(todoService.getTodos(eq("user-1"), any(), any(), any()))
                .thenReturn(List.of(sampleResponse("id-1")));

        mockMvc.perform(get("/api/todos"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].isDone").exists())
                .andExpect(jsonPath("$.items[0].done").doesNotExist());
    }

    private TodoResponse sampleResponse(String id) {
        return new TodoResponse(
                id, "제목", null,
                LocalDate.of(2026, 4, 1),
                0, 0, false,
                0, 0, null, null, null,
                Instant.parse("2026-04-01T00:00:00Z"),
                Instant.parse("2026-04-01T00:00:00Z")
        );
    }
}
