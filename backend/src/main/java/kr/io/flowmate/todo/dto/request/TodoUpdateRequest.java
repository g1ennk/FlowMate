package kr.io.flowmate.todo.dto.request;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDate;

@Getter
@Setter
public class TodoUpdateRequest {

    // PATCH는 부분 업데이트 → null이면 변경 안 함, 빈 문자열은 서비스에서 검증
    @Size(max = 200, message = "title must be at most 200 characters")
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

    // 날짜 이동(날짜 바꾸기/오늘하기/내일 하기)은 PATCH date로 처리한다.
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate date;

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
