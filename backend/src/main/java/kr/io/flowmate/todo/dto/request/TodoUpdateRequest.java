package kr.io.flowmate.todo.dto.request;

import com.fasterxml.jackson.annotation.JsonFormat;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDate;

@Getter
@Setter
public class TodoUpdateRequest {

    // PATCH는 부분 업데이트 → null이면 변경 안 함, 빈 문자열은 서비스에서 검증
    @Size(max = 200, message = "title must be at most 200 characters")
    private String title;

    private String note;

    @Setter(AccessLevel.NONE)
    private boolean noteProvided = false;

    public void setNote(String note) {
        this.note = note;
        this.noteProvided = true;
    }

    public boolean hasNote() {
        return noteProvided;
    }

    private Boolean isDone;

    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate date;

    @Min(0)
    @Max(3)
    private Integer miniDay;

    @Min(0)
    private Integer dayOrder;

    private String timerMode;

    @Setter(AccessLevel.NONE)
    private boolean timerModeProvided = false;

    public void setTimerMode(String timerMode) {
        this.timerMode = timerMode;
        this.timerModeProvided = true;
    }

    public boolean hasTimerMode() {
        return timerModeProvided;
    }

}
