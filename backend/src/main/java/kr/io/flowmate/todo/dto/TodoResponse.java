package kr.io.flowmate.todo.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.annotation.JsonProperty;
import kr.io.flowmate.todo.domain.Todo;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Getter;

import java.time.Instant;
import java.time.LocalDate;

@Getter
@AllArgsConstructor
public class TodoResponse {

    private String id;
    private String title;
    private String note;

    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate date;

    private int miniDay;
    private int dayOrder;

    // Getter로 생성 시 isIsDone()과 같은 메서드로 생성이 되기 때문에 수동으로 정의
    @Getter(AccessLevel.NONE)
    private boolean isDone;

    private int sessionCount;
    private int sessionFocusSeconds;
    private String timerMode;
    private Integer reviewRound;
    private String originalTodoId;

    @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss'Z'", timezone = "UTC")
    private Instant createdAt;

    @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss'Z'", timezone = "UTC")
    private Instant updatedAt;

    @JsonProperty("isDone")
    public boolean getIsDone() {
        return isDone;
    }

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
                todo.getTimerMode() != null ? todo.getTimerMode().name().toLowerCase() : null,
                todo.getReviewRound(),
                todo.getOriginalTodoId(),
                todo.getCreatedAt(),
                todo.getUpdatedAt()
        );
    }
}
