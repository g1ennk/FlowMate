package kr.io.flowmate.timer.event;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class TimerStateChangedEventTest {

    @Test
    void 팩토리는_전달받은_payload와_현재_시각으로_이벤트를_생성한다() {
        // given
        String userId = "user-1";
        String todoId = "todo-1";
        long version = 100L;
        String state = "{\"status\":\"running\"}";
        long before = System.currentTimeMillis();

        // when
        TimerStateChangedEvent event = TimerStateChangedEvent.of(userId, todoId, version, state);
        long after = System.currentTimeMillis();

        // then
        assertThat(event.userId()).isEqualTo(userId);
        assertThat(event.todoId()).isEqualTo(todoId);
        assertThat(event.version()).isEqualTo(version);
        assertThat(event.state()).isEqualTo(state);
        assertThat(event.ts()).isBetween(before, after);
    }

    @Test
    void 팩토리는_타이머_초기화_이벤트의_null_상태를_허용한다() {
        // given
        String state = null;

        // when
        TimerStateChangedEvent event = TimerStateChangedEvent.of(
                "user-id", "todo-id", 101L, state
        );

        // then
        assertThat(event.state()).isNull();
    }

}
