package kr.io.flowmate.common.error;

import lombok.AllArgsConstructor;
import lombok.Getter;

import java.util.Map;

@Getter
@AllArgsConstructor
public class ApiError {

    private Detail error;

    // 필드 상세 오류가 없는 일반 에러
    public static ApiError of(String code, String message) {
        return new ApiError(new Detail(code, message, null));
    }

    // validation 등 필드별 오류를 포함한 에러 생성
    public static ApiError of(String code, String message, Map<String, String> fields) {
        return new ApiError(new Detail(code, message, fields));
    }

    @Getter
    @AllArgsConstructor
    public static class Detail {
        private final String code;
        private final String message;
        private final Map<String, String> fields;
    }

}
