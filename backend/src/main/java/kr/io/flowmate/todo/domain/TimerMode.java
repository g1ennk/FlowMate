package kr.io.flowmate.todo.domain;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

import java.util.Arrays;

public enum TimerMode {
    STOPWATCH("stopwatch"),
    POMODORO("pomodoro");

    private final String value;

    TimerMode(String value) {
        this.value = value;
    }

    @JsonValue
    public String getValue() {
        return value;
    }

    @JsonCreator
    public static TimerMode fromValue(String value) {
        return Arrays.stream(values())
                .filter(mode -> mode.value.equalsIgnoreCase(value))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Invalid timerMode: " + value));
    }
}
