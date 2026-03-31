package kr.io.flowmate.todo.dto.response;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.annotation.JsonProperty;
import kr.io.flowmate.todo.domain.Todo;

import java.time.Instant;
import java.time.LocalDate;

public record TodoResponse(
        String id,
        String title,
        String note,
        @JsonFormat(pattern = "yyyy-MM-dd") LocalDate date,
        int miniDay,
        int dayOrder,
        @JsonProperty("isDone") boolean isDone,
        int sessionCount,
        int sessionFocusSeconds,
        String timerMode,
        Integer reviewRound,
        String originalTodoId,
        @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss'Z'", timezone = "UTC") Instant createdAt,
        @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss'Z'", timezone = "UTC") Instant updatedAt
) {
    public static TodoResponse from(Todo todo) {
        return new TodoResponse(
                todo.getId(),
                todo.getTitle(),
                todo.getNote(),
                todo.getDate(),
                todo.getMiniDay(),
                todo.getDayOrder(),
                todo.isDone(),
                todo.getSessionCount(),
                todo.getSessionFocusSeconds(),
                todo.getTimerMode() != null ? todo.getTimerMode().getValue() : null,
                todo.getReviewRound(),
                todo.getOriginalTodoId(),
                todo.getCreatedAt(),
                todo.getUpdatedAt()
        );
    }
}
