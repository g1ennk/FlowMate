package kr.io.flowmate.timer.event;

public record TimerStateChangedEvent(
        String userId,
        String todoId,
        long version,
        long ts,
        String state
) {
    public static TimerStateChangedEvent of(String userId, String todoId, long version, String state) {
        return new TimerStateChangedEvent(userId, todoId, version, System.currentTimeMillis(), state);
    }
}
