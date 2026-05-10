package kr.io.flowmate.todo.controller;

import kr.io.flowmate.common.util.CurrentUserResolver;
import kr.io.flowmate.common.web.CurrentUserArgumentResolver;
import kr.io.flowmate.common.web.GlobalExceptionHandler;
import kr.io.flowmate.todo.dto.response.TodoResponse;
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

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
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
                .setCustomArgumentResolvers(new CurrentUserArgumentResolver(currentUserResolver))
                .build();
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
                0, 0, null,
                Instant.parse("2026-04-01T00:00:00Z"),
                Instant.parse("2026-04-01T00:00:00Z")
        );
    }
}
