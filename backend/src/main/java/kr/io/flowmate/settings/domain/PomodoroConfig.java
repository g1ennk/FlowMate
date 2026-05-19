package kr.io.flowmate.settings.domain;

public record PomodoroConfig(int flowMin, int breakMin, int longBreakMin, int cycleEvery) {

    public static final int MIN_MINUTES = 1;
    public static final int MAX_MINUTES = 120;
    public static final int MIN_CYCLE = 1;
    public static final int MAX_CYCLE = 10;

    public PomodoroConfig {
        if (flowMin < MIN_MINUTES || flowMin > MAX_MINUTES) {
            throw new IllegalArgumentException("Flow time must be between 1 and 120 minutes");
        }
        if (breakMin < MIN_MINUTES || breakMin > MAX_MINUTES) {
            throw new IllegalArgumentException("Break time must be between 1 and 120 minutes");
        }
        if (longBreakMin < MIN_MINUTES || longBreakMin > MAX_MINUTES) {
            throw new IllegalArgumentException("Long break time must be between 1 and 120 minutes");
        }
        if (cycleEvery < MIN_CYCLE || cycleEvery > MAX_CYCLE) {
            throw new IllegalArgumentException("Cycle must be between 1 and 10");
        }
    }

}
