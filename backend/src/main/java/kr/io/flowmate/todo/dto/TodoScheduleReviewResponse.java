package kr.io.flowmate.todo.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public class TodoScheduleReviewResponse {

    private TodoResponse item;
    private boolean created;
}
