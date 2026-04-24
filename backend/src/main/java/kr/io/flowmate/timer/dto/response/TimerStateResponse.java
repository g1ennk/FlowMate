package kr.io.flowmate.timer.dto.response;

public record TimerStateResponse(
        String todoId,
        Object state,
        long serverTime
) {
}
