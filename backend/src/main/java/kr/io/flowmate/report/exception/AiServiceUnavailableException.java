package kr.io.flowmate.report.exception;

public class AiServiceUnavailableException extends RuntimeException {
    private static final String MESSAGE = "AI 서비스가 일시적으로 사용 불가 상태입니다. 잠시 후 다시 시도해 주세요";

    public AiServiceUnavailableException() {
        super(MESSAGE);
    }

    public AiServiceUnavailableException(Throwable cause) {
        super(MESSAGE, cause);
    }
}
