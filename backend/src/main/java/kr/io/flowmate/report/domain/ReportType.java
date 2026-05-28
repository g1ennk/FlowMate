package kr.io.flowmate.report.domain;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

import java.util.Arrays;

public enum ReportType {
    DAILY("daily.v2"),
    WEEKLY("weekly.v2"),
    MONTHLY("monthly.v2");

    private final String promptVersion;

    ReportType(String promptVersion) {
        this.promptVersion = promptVersion;
    }

    public String promptVersion() {
        return promptVersion;
    }

    @JsonValue
    public String value() {
        return name();
    }

    @JsonCreator
    public static ReportType from(String value) {
        if (value == null) {
            throw new IllegalArgumentException("type is required");
        }
        return Arrays.stream(values())
            .filter(t -> t.name().equalsIgnoreCase(value))
            .findFirst()
            .orElseThrow(() -> new IllegalArgumentException("invalid report type: " + value));
    }
}
