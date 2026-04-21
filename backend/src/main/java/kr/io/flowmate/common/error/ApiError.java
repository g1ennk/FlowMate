package kr.io.flowmate.common.error;

import java.util.Map;

// 모든 API 에러의 공통 응답 포맷 — { error: { code, message, fields } }
public record ApiError(Detail error) {

    // 필드 상세 오류가 없는 일반 에러
    public static ApiError of(String code, String message) {
        return new ApiError(new Detail(code, message, null));
    }

    // validation 등 필드별 오류를 포함한 에러 생성
    public static ApiError of(String code, String message, Map<String, String> fields) {
        return new ApiError(new Detail(code, message, fields));
    }

    public record Detail(String code, String message, Map<String, String> fields) {
    }
}
