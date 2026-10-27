package kr.io.flowmate.report.exception;

/** 같은 (userId, type, periodStart) 리포트를 다른 요청이 이미 생성하고 있다 */
public class ReportGenerationInProgressException extends RuntimeException {
    public ReportGenerationInProgressException() {
        super("이미 AI 레포트를 만들고 있어요. 잠시 후 다시 확인해 주세요");
    }
}
