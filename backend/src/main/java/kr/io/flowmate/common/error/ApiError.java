package kr.io.flowmate.common.error;

import java.util.Map;

public record ApiError(Detail error) {

    public record Detail(String code, String message, Map<String, String> fields) {
    }

    public static ApiError of(String code, String message) {
        return new ApiError(new Detail(code, message, null));
    }

    public static ApiError of(String code, String message, Map<String, String> fields) {
        return new ApiError(new Detail(code, message, fields));
    }
}
