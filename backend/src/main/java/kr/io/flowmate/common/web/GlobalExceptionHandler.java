package kr.io.flowmate.common.web;

import jakarta.validation.ConstraintViolationException;
import kr.io.flowmate.common.error.ApiError;
import kr.io.flowmate.common.exception.NotFoundException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingRequestHeaderException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
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

    // 도메인 NotFoundException을 404로 반환
    @ExceptionHandler(NotFoundException.class)
    public ResponseEntity<ApiError> handleNotFound(NotFoundException ex) {
        ApiError body = ApiError.of("NOT_FOUND", ex.getMessage());
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(body);
    }

    // 서비스 레이어의 입력/상태 오류를 400으로 반환
    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ApiError> handleIllegalArgumentException(IllegalArgumentException ex) {
        ApiError body = ApiError.of("BAD_REQUEST", ex.getMessage());
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(body);
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

    // 처리되지 않는 예외의 최후 방어선
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiError> handleUnexpected(Exception ex) {
        log.error("Unhandled exception", ex);
        ApiError body = ApiError.of("INTERNAL_ERROR", "Internal server error");
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(body);
    }
}
