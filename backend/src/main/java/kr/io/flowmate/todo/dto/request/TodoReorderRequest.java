package kr.io.flowmate.todo.dto.request;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import lombok.Getter;
import lombok.Setter;

import java.util.List;

@Getter
@Setter
public class TodoReorderRequest {

    @Valid
    @NotEmpty
    private List<Item> items;

    @Getter
    @Setter
    public static class Item {

        @NotBlank
        private String id;

        @NotNull
        @Min(0)
        private Integer dayOrder;

        @NotNull
        @Min(0)
        @Max(3)
        private Integer miniDay;
    }
}
