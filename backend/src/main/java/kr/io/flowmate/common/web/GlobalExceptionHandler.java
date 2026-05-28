package kr.io.flowmate.common.web;

import jakarta.validation.ConstraintViolationException;
import kr.io.flowmate.common.error.ApiError;
import kr.io.flowmate.common.exception.AuthenticationFailedException;
import kr.io.flowmate.common.exception.IdempotencyConflictException;
import kr.io.flowmate.common.exception.NotFoundException;
import kr.io.flowmate.report.exception.AiServiceQuotaExceededException;
import kr.io.flowmate.report.exception.AiServiceUnavailableException;
import kr.io.flowmate.report.exception.ReportGenerationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.CannotAcquireLockException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.FieldError;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingRequestHeaderException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.async.AsyncRequestNotUsableException;
import org.springframework.web.context.request.async.AsyncRequestTimeoutException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.util.LinkedHashMap;
import java.util.Map;

// 모든 컨트롤러에서 발생한 예외를 한 곳에서 처리
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    // @Valid 바인딩 실패를 400 + 필드맵으로 변환
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiError> handleValidation(MethodArgumentNotValidException ex) {
        Map<String, String> fields = new LinkedHashMap<>();
        for (FieldError fieldError : ex.getBindingResult().getFieldErrors()) {
            fields.put(fieldError.getField(), fieldError.getDefaultMessage());
        }
        ApiError body = ApiError.of("VALIDATION_ERROR", "validation failed", fields);
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(body);
    }

    // 파라미터/경로 변수 등 제약조건 위반을 400으로 매핑
    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<ApiError> handleConstraint(ConstraintViolationException ex) {
        Map<String, String> fields = new LinkedHashMap<>();
        ex.getConstraintViolations().forEach(v -> fields.put(v.getPropertyPath().toString(), v.getMessage()));
        ApiError body = ApiError.of("VALIDATION_ERROR", "validation failed", fields);
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(body);
    }

    // 필수 헤더 누락 시 400으로 응답
    @ExceptionHandler(MissingRequestHeaderException.class)
    public ResponseEntity<ApiError> handleMissingHeader(MissingRequestHeaderException ex) {
        ApiError body = ApiError.of("BAD_REQUEST", ex.getHeaderName() + " header is required");
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(body);
    }

    // 필수 쿼리 파라미터 누락 시 400으로 응답
    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ResponseEntity<ApiError> handleMissingParameter(MissingServletRequestParameterException ex) {
        ApiError body = ApiError.of("BAD_REQUEST", ex.getParameterName() + " parameter is required");
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(body);
    }

    // 잘못된 JSON 바디(파싱 실패, 타입 불일치)는 클라이언트 오류이므로 400
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiError> handleUnreadable(HttpMessageNotReadableException ex) {
        ApiError body = ApiError.of("BAD_REQUEST", "요청 본문을 읽을 수 없습니다");
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(body);
    }

    // 도메인 NotFoundException을 404로 반환
    @ExceptionHandler(NotFoundException.class)
    public ResponseEntity<ApiError> handleNotFound(NotFoundException ex) {
        ApiError body = ApiError.of("NOT_FOUND", ex.getMessage());
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(body);
    }

    // 인증/인가 실패 (JWT·RT·SSE 토큰)를 401로 매핑
    @ExceptionHandler(AuthenticationFailedException.class)
    public ResponseEntity<ApiError> handleAuthenticationFailed(AuthenticationFailedException ex) {
        log.warn("Authentication failed: {}", ex.getMessage());
        ApiError body = ApiError.of("AUTHENTICATION_FAILED", ex.getMessage());
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(body);
    }

    // 멱등성 키 재사용 시 페이로드 불일치 등 409 Conflict 로 매핑
    @ExceptionHandler(IdempotencyConflictException.class)
    public ResponseEntity<ApiError> handleIdempotencyConflict(IdempotencyConflictException ex) {
        log.info("Idempotency conflict: {}", ex.getMessage());
        ApiError body = ApiError.of("IDEMPOTENCY_CONFLICT", ex.getMessage());
        return ResponseEntity.status(HttpStatus.CONFLICT).body(body);
    }

    // 서비스 레이어의 입력/상태 오류를 400으로 반환
    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ApiError> handleIllegalArgumentException(IllegalArgumentException ex) {
        ApiError body = ApiError.of("BAD_REQUEST", ex.getMessage());
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(body);
    }

    // Gemini API quota 초과 — 한국어 메시지 그대로 노출
    @ExceptionHandler(AiServiceQuotaExceededException.class)
    public ResponseEntity<ApiError> handleAiQuota(AiServiceQuotaExceededException ex) {
        log.warn("AI quota exceeded: {}", ex.getMessage());
        ApiError body = ApiError.of("AI_QUOTA_EXCEEDED", ex.getMessage());
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).body(body);
    }

    // Gemini API 503 — 한국어 메시지 그대로
    @ExceptionHandler(AiServiceUnavailableException.class)
    public ResponseEntity<ApiError> handleAiUnavailable(AiServiceUnavailableException ex) {
        log.warn("AI service unavailable: {}", ex.getMessage());
        ApiError body = ApiError.of("AI_SERVICE_UNAVAILABLE", ex.getMessage());
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(body);
    }

    // Gemini 응답 파싱 실패 / 필수 필드 누락 등 → 500
    @ExceptionHandler(ReportGenerationException.class)
    public ResponseEntity<ApiError> handleReportGeneration(ReportGenerationException ex) {
        log.error("Report generation failed", ex);
        ApiError body = ApiError.of("REPORT_GENERATION_FAILED", "AI report generation failed");
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(body);
    }

    // 경로는 존재하지만 HTTP 메서드가 매칭되지 않는 경우를 405로 반환 (4xx → 5xx 유출 방지)
    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<ApiError> handleMethodNotAllowed(HttpRequestMethodNotSupportedException ex) {
        ApiError body = ApiError.of("METHOD_NOT_ALLOWED", ex.getMethod() + " method is not supported");
        return ResponseEntity.status(HttpStatus.METHOD_NOT_ALLOWED).body(body);
    }

    // 존재하지 않는 URL 접근을 404로 통일
    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<ApiError> handleNoResourceFound(NoResourceFoundException ex) {
        ApiError body = ApiError.of("NOT_FOUND", "resource not found");
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(body);
    }

    // SSE 등 장기 async 요청 timeout은 재연결 가능한 종료로 취급
    @ExceptionHandler(AsyncRequestTimeoutException.class)
    public ResponseEntity<Void> handleAsyncRequestTimeout(AsyncRequestTimeoutException ex) {
        log.debug("Async request timed out", ex);
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).build();
    }

    // SSE 클라이언트가 먼저 연결을 닫은 경우는 정상 종료로 간주
    @ExceptionHandler(AsyncRequestNotUsableException.class)
    public ResponseEntity<Void> handleAsyncRequestNotUsable(AsyncRequestNotUsableException ex) {
        log.debug("Async request disconnected", ex);
        return ResponseEntity.noContent().build();
    }

    // 데드락 retry 소진 시 409 Conflict 반환
    @ExceptionHandler(CannotAcquireLockException.class)
    public ResponseEntity<ApiError> handleDeadlock(CannotAcquireLockException ex) {
        log.warn("Deadlock retry exhausted", ex);
        ApiError body = ApiError.of("CONFLICT", "일시적 충돌이 발생했습니다. 잠시 후 다시 시도해 주세요.");
        return ResponseEntity.status(HttpStatus.CONFLICT).body(body);
    }

    // 방어 코드 ISE 는 500 INTERNAL_ERROR 로 고정 (catch-all Exception 에 떨어지기 전 전용 핸들러)
    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<ApiError> handleIllegalState(IllegalStateException ex) {
        log.error("Illegal state (likely defensive code path)", ex);
        ApiError body = ApiError.of("INTERNAL_ERROR", "서버 내부 오류");
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(body);
    }

    // 처리되지 않는 예외의 최후 방어선
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiError> handleUnexpected(Exception ex) {
        log.error("Unhandled exception", ex);
        ApiError body = ApiError.of("INTERNAL_ERROR", "Internal server error");
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(body);
    }
}
