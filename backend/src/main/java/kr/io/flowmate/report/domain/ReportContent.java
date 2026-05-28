package kr.io.flowmate.report.domain;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

@JsonInclude(JsonInclude.Include.ALWAYS)
public record ReportContent(
    String keep,
    String problem,
    @JsonProperty("try") String tryAction,
    String referenceQuestion
) {}
