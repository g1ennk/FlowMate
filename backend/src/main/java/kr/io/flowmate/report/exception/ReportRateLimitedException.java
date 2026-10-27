package kr.io.flowmate.report.exception;

import lombok.Getter;

/** FlowMate 자체 생성 제한. Gemini quota 초과(AiServiceQuotaExceededException)와는 다른 오류다 */
@Getter
public class ReportRateLimitedException extends RuntimeException {

    public enum Reason { USER_LIMIT, COOLDOWN }

    private final Reason reason;
    private final long retryAfterSeconds;

    public ReportRateLimitedException(Reason reason, long retryAfterSeconds) {
        super(message(reason, retryAfterSeconds));
        this.reason = reason;
        this.retryAfterSeconds = retryAfterSeconds;
    }

    private static String message(Reason reason, long retryAfterSeconds) {
        return switch (reason) {
            case COOLDOWN -> "방금 만든 레포트예요. " + retryAfterSeconds + "초 뒤에 다시 만들 수 있어요";
            case USER_LIMIT -> "AI 레포트를 너무 자주 만들었어요. "
                + Math.max(1, (retryAfterSeconds + 59) / 60) + "분 뒤에 다시 시도해 주세요";
        };
    }
}
