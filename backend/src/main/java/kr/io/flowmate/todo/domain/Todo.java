package kr.io.flowmate.todo.domain;

import jakarta.persistence.*;
import kr.io.flowmate.common.domain.BaseTimeEntity;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "todos")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Todo extends BaseTimeEntity {

    @Id
    @Column(length = 36)
    private String id;

    @Column(name = "user_id", nullable = false, length = 36)
    private String userId;

    @Column(nullable = false, length = 200)
    private String title;

    @Column(columnDefinition = "TEXT")
    private String note;

    @Column(nullable = false)
    private LocalDate date;

    @Column(name = "mini_day", nullable = false)
    private int miniDay;

    @Column(name = "day_order", nullable = false)
    private int dayOrder;

    @Column(name = "is_done", nullable = false)
    private boolean done;

    @Column(name = "session_count", nullable = false)
    private int sessionCount;

    @Column(name = "session_focus_seconds", nullable = false)
    private int sessionFocusSeconds;

    @Enumerated(EnumType.STRING)
    @Column(name = "timer_mode", length = 20)
    private TimerMode timerMode;

    @Column(name = "review_round")
    private Integer reviewRound;

    @Column(name = "original_todo_id", length = 36)
    private String originalTodoId;

    public static Todo create(String userId, String title, String note, LocalDate date, int miniDay, int dayOrder) {
        Todo todo = new Todo();

        todo.id = UUID.randomUUID().toString();
        todo.userId = userId;
        todo.title = title;
        todo.note = note;
        todo.date = date;
        todo.miniDay = miniDay;
        todo.dayOrder = dayOrder;
        todo.done = false;
        todo.sessionCount = 0;
        todo.sessionFocusSeconds = 0;
        todo.timerMode = null;
        todo.reviewRound = null;
        todo.originalTodoId = null;
        return todo;
    }

    public static Todo createReview(
            String userId,
            String originalTodoId,
            String title,
            String note,
            LocalDate date,
            int miniDay,
            int dayOrder,
            int reviewRound
    ) {
        Todo todo = create(userId, title, note, date, miniDay, dayOrder);
        todo.reviewRound = reviewRound;
        todo.originalTodoId = originalTodoId;
        return todo;
    }

    public void updateTitle(String title) {
        this.title = title;
    }

    public void updateNote(String note) {
        this.note = note;
    }

    public void updateDone(boolean done) {
        this.done = done;
    }

    public void updateDate(LocalDate date) {
        this.date = date;
    }

    public void updateMiniDay(int miniDay) {
        this.miniDay = miniDay;
    }

    public void updateDayOrder(int dayOrder) {
        this.dayOrder = dayOrder;
    }

    public void updateTimerMode(TimerMode timerMode) {
        this.timerMode = timerMode;
    }

    public void incrementSessionCount() {
        this.sessionCount++;
    }

    public void addSessionFocusSeconds(int seconds) {
        this.sessionFocusSeconds += seconds;
    }

}
