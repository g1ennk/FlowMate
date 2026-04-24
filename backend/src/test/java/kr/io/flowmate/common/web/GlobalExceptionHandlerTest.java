package kr.io.flowmate.common.web;

import kr.io.flowmate.common.error.ApiError;
import kr.io.flowmate.common.exception.AuthenticationFailedException;
import kr.io.flowmate.common.exception.IdempotencyConflictException;
import kr.io.flowmate.common.exception.NotFoundException;
import kr.io.flowmate.todo.exception.TodoStateViolationException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.core.MethodParameter;
import org.springframework.dao.CannotAcquireLockException;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.validation.BeanPropertyBindingResult;
import org.springframework.validation.BindingResult;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.context.request.async.AsyncRequestTimeoutException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.lang.reflect.Method;

import static org.assertj.core.api.Assertions.assertThat;

@DisplayName("GlobalExceptionHandlerTest")
class GlobalExceptionHandlerTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    @Test
    @DisplayName("handleValidation: @Valid 실패를 400 + VALIDATION_ERROR + fields 맵으로 매핑")
    void handleValidation_returns400WithFieldMap() {
        BindingResult binding = new BeanPropertyBindingResult(new Object(), "target");
        binding.addError(new FieldError("target", "title", "must not be blank"));
        MethodArgumentNotValidException ex = new MethodArgumentNotValidException(dummyMethodParameter(), binding);

        ResponseEntity<ApiError> response = handler.handleValidation(ex);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(response.getBody().error().code()).isEqualTo("VALIDATION_ERROR");
        assertThat(response.getBody().error().fields()).containsEntry("title", "must not be blank");
    }

    @Test
    @DisplayName("handleNotFound: 도메인 NotFoundException 을 404 NOT_FOUND 로 매핑")
    void handleNotFound_returns404() {
        ResponseEntity<ApiError> response = handler.handleNotFound(new NotFoundException("todo 없음"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(response.getBody().error().code()).isEqualTo("NOT_FOUND");
        assertThat(response.getBody().error().message()).isEqualTo("todo 없음");
    }

    @Test
    @DisplayName("handleAuthenticationFailed: JWT·RT·SSE 토큰 실패를 401 AUTHENTICATION_FAILED 로 매핑")
    void handleAuthenticationFailed_returns401() {
        ResponseEntity<ApiError> response = handler.handleAuthenticationFailed(
                new AuthenticationFailedException("유효하지 않은 토큰"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(response.getBody().error().code()).isEqualTo("AUTHENTICATION_FAILED");
        assertThat(response.getBody().error().message()).isEqualTo("유효하지 않은 토큰");
    }

    @Test
    @DisplayName("handleIdempotencyConflict: 멱등성 키 재사용 + payload 불일치를 409 IDEMPOTENCY_CONFLICT 로 매핑")
    void handleIdempotencyConflict_returns409() {
        ResponseEntity<ApiError> response = handler.handleIdempotencyConflict(
                new IdempotencyConflictException("focusSeconds mismatch"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(response.getBody().error().code()).isEqualTo("IDEMPOTENCY_CONFLICT");
        assertThat(response.getBody().error().message()).isEqualTo("focusSeconds mismatch");
    }

    @Test
    @DisplayName("handleTodoStateViolation: 완료되지 않은 Todo 복습 스케줄 등을 409 TODO_STATE_VIOLATION 로 매핑")
    void handleTodoStateViolation_returns409() {
        ResponseEntity<ApiError> response = handler.handleTodoStateViolation(
                new TodoStateViolationException("완료된 Todo만 복습 등록할 수 있습니다"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(response.getBody().error().code()).isEqualTo("TODO_STATE_VIOLATION");
        assertThat(response.getBody().error().message()).isEqualTo("완료된 Todo만 복습 등록할 수 있습니다");
    }

    @Test
    @DisplayName("handleIllegalArgumentException: 서비스 IAE 를 400 BAD_REQUEST 로 매핑")
    void handleIllegalArgument_returns400() {
        ResponseEntity<ApiError> response = handler.handleIllegalArgumentException(new IllegalArgumentException("잘못된 입력"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(response.getBody().error().code()).isEqualTo("BAD_REQUEST");
    }

    @Test
    @DisplayName("handleUnreadable: 잘못된 JSON 바디를 400 BAD_REQUEST 로 매핑 (500 아님)")
    void handleUnreadable_returns400() {
        ResponseEntity<ApiError> response = handler.handleUnreadable(
                new HttpMessageNotReadableException("malformed json", null, null)
        );

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(response.getBody().error().code()).isEqualTo("BAD_REQUEST");
    }

    @Test
    @DisplayName("handleMethodNotAllowed: 매칭되는 경로에 다른 HTTP 메서드 요청은 405 METHOD_NOT_ALLOWED (500 아님)")
    void handleMethodNotAllowed_returns405() {
        ResponseEntity<ApiError> response = handler.handleMethodNotAllowed(
                new HttpRequestMethodNotSupportedException("GET")
        );

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.METHOD_NOT_ALLOWED);
        assertThat(response.getBody().error().code()).isEqualTo("METHOD_NOT_ALLOWED");
    }

    @Test
    @DisplayName("handleNoResourceFound: 존재하지 않는 URL 을 404 NOT_FOUND 로 통일")
    void handleNoResourceFound_returns404() {
        ResponseEntity<ApiError> response = handler.handleNoResourceFound(
                new NoResourceFoundException(HttpMethod.GET, "/api/unknown", "unknown")
        );

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(response.getBody().error().code()).isEqualTo("NOT_FOUND");
    }

    @Test
    @DisplayName("handleAsyncRequestTimeout: SSE 장기 async 타임아웃은 503 빈 바디 (재연결 가능)")
    void handleAsyncRequestTimeout_returns503Empty() {
        ResponseEntity<Void> response = handler.handleAsyncRequestTimeout(new AsyncRequestTimeoutException());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
        assertThat(response.getBody()).isNull();
    }

    @Test
    @DisplayName("handleDeadlock: 데드락 retry 소진을 409 CONFLICT 로 매핑")
    void handleDeadlock_returns409() {
        ResponseEntity<ApiError> response = handler.handleDeadlock(new CannotAcquireLockException("retry exhausted"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(response.getBody().error().code()).isEqualTo("CONFLICT");
    }

    @Test
    @DisplayName("handleIllegalState: 방어 코드 ISE 를 500 INTERNAL_ERROR 로 고정 (catch-all Exception 에 떨어지지 않도록 전용 핸들러)")
    void handleIllegalState_returns500() {
        ResponseEntity<ApiError> response = handler.handleIllegalState(new IllegalStateException("사용자를 찾을 수 없습니다"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        assertThat(response.getBody().error().code()).isEqualTo("INTERNAL_ERROR");
        assertThat(response.getBody().error().message()).isEqualTo("서버 내부 오류");
    }

    @Test
    @DisplayName("handleUnexpected: 모르는 예외는 500 + 고정 메시지 (내부 정보 노출 금지)")
    void handleUnexpected_returns500WithGenericMessage() {
        ResponseEntity<ApiError> response = handler.handleUnexpected(new RuntimeException("boom"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        assertThat(response.getBody().error().code()).isEqualTo("INTERNAL_ERROR");
        assertThat(response.getBody().error().message()).isEqualTo("Internal server error");
    }

    private static MethodParameter dummyMethodParameter() {
        try {
            Method method = GlobalExceptionHandlerTest.class.getDeclaredMethod("handleValidation_returns400WithFieldMap");
            return new MethodParameter(method, -1);
        } catch (NoSuchMethodException e) {
            throw new IllegalStateException(e);
        }
    }
}
