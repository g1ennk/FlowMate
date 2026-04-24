package kr.io.flowmate.session.domain;

import jakarta.persistence.*;
import kr.io.flowmate.common.domain.BaseTimeEntity;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.UUID;

@Entity
@Table(name = "todo_sessions")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class TodoSession extends BaseTimeEntity {

    @Id
    @Column(length = 36)
    private String id;

    @Column(name = "todo_id", nullable = false, length = 36)
    private String todoId;

    @Column(name = "user_id", nullable = false, length = 36)
    private String userId;

    @Column(name = "client_session_id", nullable = false, length = 36)
    private String clientSessionId;

    @Column(name = "session_focus_seconds", nullable = false)
    private int sessionFocusSeconds;

    @Column(name = "break_seconds", nullable = false)
    private int breakSeconds;

    @Column(name = "session_order", nullable = false)
    private int sessionOrder;

    public static TodoSession create(
            String userId,
            String todoId,
            String clientSessionId,
            int sessionFocusSeconds,
            int breakSeconds,
            int sessionOrder
    ) {
        TodoSession session = new TodoSession();

        session.id = UUID.randomUUID().toString();
        session.userId = userId;
        session.todoId = todoId;
        session.clientSessionId = clientSessionId;
        session.sessionFocusSeconds = sessionFocusSeconds;
        session.breakSeconds = breakSeconds;
        session.sessionOrder = sessionOrder;

        return session;
    }

    public boolean increaseBreakSecondsIfGreater(int nextBreakSeconds) {
        if (nextBreakSeconds <= this.breakSeconds) {
            return false;
        }
        this.breakSeconds = nextBreakSeconds;
        return true;
    }

}
