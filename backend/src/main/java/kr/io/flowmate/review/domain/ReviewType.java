package kr.io.flowmate.review.domain;

import java.util.Arrays;

public enum ReviewType {

    DAILY("daily"),
    WEEKLY("weekly"),
    MONTHLY("monthly");

    private final String value;

    ReviewType(String value) {
        this.value = value;
    }

    public String getValue() {
        return value;
    }

    public static ReviewType fromValue(String value) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("type is required");
        }

        String normalized = value.trim();
        return Arrays.stream(values())
                .filter(type -> type.value.equalsIgnoreCase(normalized))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Invalid review type: " + value));
    }

}
