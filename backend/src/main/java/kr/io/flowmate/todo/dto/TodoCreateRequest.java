package kr.io.flowmate.todo.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDate;

@Getter
@Setter
public class TodoCreateRequest {

    @NotBlank
    @Size(max = 200)
    private String title;

    private String note;

    @NotNull
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate date;

    @NotNull
    @Min(0)
    @Max(3)
    private Integer miniDay;

    @NotNull
    @Min(0)
    private Integer dayOrder;
}
