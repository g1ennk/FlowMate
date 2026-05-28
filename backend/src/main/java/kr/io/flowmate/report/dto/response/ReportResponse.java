package kr.io.flowmate.report.dto.response;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.annotation.JsonProperty;
import kr.io.flowmate.report.domain.Report;

import java.time.Instant;
import java.time.LocalDate;

public record ReportResponse(
    String id,
    String type,
    @JsonFormat(pattern = "yyyy-MM-dd") LocalDate periodStart,
    String keep,
    String problem,
    @JsonProperty("try") String tryAction,
    String referenceQuestion,
    String promptVersion,
    @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss'Z'", timezone = "UTC") Instant createdAt
) {
    public static ReportResponse from(Report report) {
        return new ReportResponse(
            report.getId(),
            report.getType().name(),
            report.getPeriodStart(),
            report.getContent().keep(),
            report.getContent().problem(),
            report.getContent().tryAction(),
            report.getContent().referenceQuestion(),
            report.getPromptVersion(),
            report.getCreatedAt()
        );
    }
}
