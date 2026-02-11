package kr.io.flowmate.todo.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class TodoUpdateRequest {

    @Size(min = 1, max = 200)
    private String title;

    @JsonProperty("note")
    private String note;

    // note 필드가 명시적으로 제공되었는지 확인
    // Jackson이 JSON에서 note 필드를 파싱했는지 추적
    private boolean noteProvided = false;

    // Jackson이 note를 세팅할 때 호출됨
    public void setNote(String note) {
        this.note = note;
        this.noteProvided = true;
    }

    public boolean hasNote() {
        return noteProvided;
    }

    private Boolean isDone;

    @Min(0)
    @Max(3)
    private Integer miniDay;

    @Min(0)
    private Integer dayOrder;

    @JsonProperty("timerMode")
    private String timerMode;

    private boolean timerModeProvided = false;

    public void setTimerMode(String timerMode) {
        this.timerMode = timerMode;
        this.timerModeProvided = true;
    }

    public boolean hasTimerMode() {
        return timerModeProvided;
    }

}
