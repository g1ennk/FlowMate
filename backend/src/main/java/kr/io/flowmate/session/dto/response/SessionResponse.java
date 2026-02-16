package kr.io.flowmate.session.dto.response;

import com.fasterxml.jackson.annotation.JsonFormat;
import kr.io.flowmate.session.domain.TodoSession;
import lombok.AllArgsConstructor;
import lombok.Getter;

import java.time.Instant;

@Getter
@AllArgsConstructor
public class SessionResponse {

    private String id;
    private String todoId;
    private int sessionFocusSeconds;
    private int breakSeconds;
    private int sessionOrder;

    @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss'Z'", timezone = "UTC")
    private Instant createdAt;

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
