package kr.io.flowmate.timer.domain;

import jakarta.persistence.*;
import kr.io.flowmate.common.domain.BaseTimeEntity;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "timer_states")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class TimerState extends BaseTimeEntity {

    @Id
    @Column(name = "todo_id", nullable = false, length = 36)
    private String todoId;

    @Column(name = "user_id", nullable = false, length = 36)
    private String userId;

    @Column(name = "state_json", columnDefinition = "TEXT")
    private String stateJson;

    @Column(nullable = false)
    private long version;

    public static TimerState create(String todoId, String userId) {
        TimerState ts = new TimerState();

        ts.todoId = todoId;
        ts.userId = userId;
        ts.stateJson = null;
        ts.version = 0L;
        return ts;
    }

    public void update(String stateJson, long version) {
        this.stateJson = stateJson;
        this.version = version;
    }
}
