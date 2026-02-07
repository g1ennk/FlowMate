package kr.io.flowmate.common.util;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Component;

import java.util.UUID;

@Component
public class ClientIdResolver {

    private static final String HEADER_NAME = "X-Client-Id";

    // X-Client-Id 헤더 추출
    public String resolve(HttpServletRequest request) {
        String clientId = request.getHeader(HEADER_NAME);
        if (clientId == null || clientId.isBlank()) {
            throw new IllegalArgumentException("X-Client-Id header is required");
        }

        // UUID 형식 검증
        String trimmed = clientId.trim();
        if (!isValidUuid(trimmed)) {
            throw new IllegalArgumentException("X-Client-Id must be a valid UUID");
        }

        return trimmed;
    }

    private boolean isValidUuid(String clientId) {
        try {
            UUID.fromString(clientId);
            return true;
        } catch (IllegalArgumentException e) {
            return false;
        }
    }

}
