package kr.io.flowmate.settings.domain;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.Instant;

@Entity
@Table(name = "user_settings")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class UserSettings {

    @Id
    @Column(name = "user_id", length = 36)
    private String userId;

    // Pomodoro Session
    @Column(name = "flow_min", nullable = false)
    private int flowMin;

    @Column(name = "break_min", nullable = false)
    private int breakMin;

    @Column(name = "long_break_min", nullable = false)
    private int longBreakMin;

    @Column(name = "cycle_every", nullable = false)
    private int cycleEvery;

    // Automation
    @Column(name = "auto_start_session", nullable = false)
    private boolean autoStartSession;

    @Column(name = "auto_start_break", nullable = false)
    private boolean autoStartBreak;

    // MiniDays
    @Column(name = "day1_label", nullable = false, length = 50)
    private String day1Label;

    @Column(name = "day1_start_min", nullable = false)
    private int day1StartMin;

    @Column(name = "day1_end_min", nullable = false)
    private int day1EndMin;

    @Column(name = "day2_label", nullable = false, length = 50)
    private String day2Label;

    @Column(name = "day2_start_min", nullable = false)
    private int day2StartMin;

    @Column(name = "day2_end_min", nullable = false)
    private int day2EndMin;

    @Column(name = "day3_label", nullable = false, length = 50)
    private String day3Label;

    @Column(name = "day3_start_min", nullable = false)
    private int day3StartMin;

    @Column(name = "day3_end_min", nullable = false)
    private int day3EndMin;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public static UserSettings createWithDefaults(String userId) {
        UserSettings settings = new UserSettings();
        settings.userId = userId;

        settings.flowMin = 25;
        settings.breakMin = 5;
        settings.longBreakMin = 15;
        settings.cycleEvery = 4;

        settings.autoStartSession = false;
        settings.autoStartBreak = false;

        // MiniDay VO를 통해 검증된 기본값 설정
        MiniDay defaultDay1 = new MiniDay("오전", 360, 720);
        MiniDay defaultDay2 = new MiniDay("오후", 720, 1080);
        MiniDay defaultDay3 = new MiniDay("저녁", 1080, 1440);

        settings.day1Label = defaultDay1.label();
        settings.day1StartMin = defaultDay1.startMin();
        settings.day1EndMin = defaultDay1.endMin();

        settings.day2Label = defaultDay2.label();
        settings.day2StartMin = defaultDay2.startMin();
        settings.day2EndMin = defaultDay2.endMin();

        settings.day3Label = defaultDay3.label();
        settings.day3StartMin = defaultDay3.startMin();
        settings.day3EndMin = defaultDay3.endMin();

        return settings;
    }

    public void updatePomodoro(PomodoroConfig config) {
        this.flowMin = config.flowMin();
        this.breakMin = config.breakMin();
        this.longBreakMin = config.longBreakMin();
        this.cycleEvery = config.cycleEvery();
    }

    public void updateAutomation(boolean autoStartBreak, boolean autoStartSession) {
        this.autoStartBreak = autoStartBreak;
        this.autoStartSession = autoStartSession;
    }

    public void updateMiniDays(MiniDay day1, MiniDay day2, MiniDay day3) {
        this.day1Label = day1.label();
        this.day1StartMin = day1.startMin();
        this.day1EndMin = day1.endMin();

        this.day2Label = day2.label();
        this.day2StartMin = day2.startMin();
        this.day2EndMin = day2.endMin();

        this.day3Label = day3.label();
        this.day3StartMin = day3.startMin();
        this.day3EndMin = day3.endMin();
    }

    public PomodoroConfig getPomodoroConfig() {
        return new PomodoroConfig(flowMin, breakMin, longBreakMin, cycleEvery);
    }

    public MiniDay getDay1() {
        return new MiniDay(day1Label, day1StartMin, day1EndMin);
    }

    public MiniDay getDay2() {
        return new MiniDay(day2Label, day2StartMin, day2EndMin);
    }

    public MiniDay getDay3() {
        return new MiniDay(day3Label, day3StartMin, day3EndMin);
    }

    @PrePersist
    public void onCreate() {
        this.updatedAt = Instant.now();
    }

    @PreUpdate
    public void onUpdate() {
        this.updatedAt = Instant.now();
    }
}
