package kr.io.flowmate.todo.domain;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;

@DisplayName("Todo")
class TodoTest {

    @Test
    @DisplayName("create: 신규 Todo는 done=false, 집계=0, timerMode/reviewRound=null로 강제된다")
    void create_enforcesDefaults() {
        Todo todo = Todo.create("user-1", "제목", "메모", LocalDate.of(2026, 4, 1), 0, 0);

        assertThat(todo.getId()).isNotBlank();
        assertThat(todo.isDone()).isFalse();
        assertThat(todo.getSessionCount()).isZero();
        assertThat(todo.getSessionFocusSeconds()).isZero();
        assertThat(todo.getTimerMode()).isNull();
        assertThat(todo.getReviewRound()).isNull();
        assertThat(todo.getOriginalTodoId()).isNull();
    }

}
