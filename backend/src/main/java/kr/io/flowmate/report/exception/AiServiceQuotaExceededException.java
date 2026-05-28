package kr.io.flowmate.report.exception;

public class AiServiceQuotaExceededException extends RuntimeException {
    public AiServiceQuotaExceededException() {
        super("AI 서비스가 일시적으로 사용량이 초과되었습니다");
    }
}
