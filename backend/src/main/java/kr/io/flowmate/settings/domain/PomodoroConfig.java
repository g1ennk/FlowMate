package kr.io.flowmate.settings.domain;

public record PomodoroConfig(int flowMin, int breakMin, int longBreakMin, int cycleEvery) {

    public PomodoroConfig {
        if (flowMin < 1 || flowMin > 90) {
            throw new IllegalArgumentException("Flow time must be between 1 and 90 minutes");
        }
        if (breakMin < 1 || breakMin > 90) {
            throw new IllegalArgumentException("Break time must be between 1 and 90 minutes");
        }
        if (longBreakMin < 1 || longBreakMin > 90) {
            throw new IllegalArgumentException("Long break time must be between 1 and 90 minutes");
        }
        if (cycleEvery < 1 || cycleEvery > 10) {
            throw new IllegalArgumentException("Cycle must be between 1 and 10");
        }
    }

}
