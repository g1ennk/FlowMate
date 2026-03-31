package kr.io.flowmate.review.dto.request;

import com.fasterxml.jackson.annotation.JsonFormat;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDate;

@Getter
@Setter
public class ReviewUpsertRequest {

    @NotBlank(message = "type is required")
    private String type;

    @NotNull(message = "periodStart is required")
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate periodStart;

    @NotNull(message = "periodEnd is required")
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate periodEnd;

    @NotBlank(message = "content is required")
    @jakarta.validation.constraints.Size(max = 10000, message = "content must be at most 10000 characters")
    private String content;
}
