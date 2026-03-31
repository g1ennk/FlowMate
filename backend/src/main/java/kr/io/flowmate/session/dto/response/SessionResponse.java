package kr.io.flowmate.session.dto.response;

import com.fasterxml.jackson.annotation.JsonFormat;
import kr.io.flowmate.session.domain.TodoSession;

import java.time.Instant;

public record SessionResponse(
        String id,
        String todoId,
        int sessionFocusSeconds,
        int breakSeconds,
        int sessionOrder,
        @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss'Z'", timezone = "UTC") Instant createdAt
) {
    public static SessionResponse from(TodoSession session) {
        return new SessionResponse(
                session.getId(),
                session.getTodoId(),
                session.getSessionFocusSeconds(),
                session.getBreakSeconds(),
                session.getSessionOrder(),
                session.getCreatedAt()
        );
    }
}
