package kr.io.flowmate.timer.dto;

public record TimerStateResponse(
        String todoId,
        Object state,
        long serverTime
) {
}
