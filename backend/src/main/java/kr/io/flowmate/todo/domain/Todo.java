package kr.io.flowmate.todo.domain;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "todos")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Todo {

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
    @Getter(AccessLevel.NONE)  // Lombok 자동 생성 방지 (수동 정의하므로)
    private boolean done;

    @Column(name = "session_count", nullable = false)
    private int sessionCount;

    @Column(name = "session_focus_seconds", nullable = false)
    private int sessionFocusSeconds;

    @Enumerated(EnumType.STRING)
    @Column(name = "timer_mode", length = 20)
    private TimerMode timerMode;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    // 신규 Todo 생성용 정적 팩토리(static factory)로 생성 시 기본 상태를 강제한다.
    public static Todo create(String userId, String title, String note, LocalDate date, int miniDay, int dayOrder) {
        Todo todo = new Todo();
        Instant now = Instant.now();

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
        todo.createdAt = now;
        todo.updatedAt = now;
        return todo;
    }

    // 수정 메서드
    public void updateTitle(String title) {
        this.title = title;
    }

    public void updateNote(String note) {
        this.note = note;
    }

    public void updateDone(boolean done) {
        this.done = done;
    }

    // 기존 Todo identity를 유지한 채 소속 날짜만 이동한다. (태스크 날짜 이동 기능)
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

    // Session 생성 시 session_count를 1 증가시킨다.
    public void incrementSessionCount() {
        this.sessionCount++;
    }

    // Session 생성 시 집중 시간(초)을 누적한다.
    public void addSessionFocusSeconds(int seconds) {
        this.sessionFocusSeconds += seconds;
    }

    // Session 집계가 드리프트된 경우, 세션 테이블 기준값으로 동기화한다.
    public void syncSessionAggregate(int sessionCount, int sessionFocusSeconds) {
        this.sessionCount = Math.max(0, sessionCount);
        this.sessionFocusSeconds = Math.max(0, sessionFocusSeconds);
    }

    @PrePersist
    public void onCreate() {
        if (this.createdAt == null) {
            Instant now = Instant.now();
            this.createdAt = now;
            this.updatedAt = now;
        }
    }

    @PreUpdate
    public void onUpdate() {
        this.updatedAt = Instant.now();
    }

    public boolean isDone() {
        return done;
    }

}
