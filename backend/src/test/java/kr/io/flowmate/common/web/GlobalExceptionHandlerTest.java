package kr.io.flowmate.common.web;

import kr.io.flowmate.common.error.ApiError;
import kr.io.flowmate.common.exception.NotFoundException;
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
