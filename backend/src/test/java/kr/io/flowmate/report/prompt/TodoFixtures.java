package kr.io.flowmate.report.prompt;

import kr.io.flowmate.todo.domain.Todo;

import java.lang.reflect.Field;
import java.time.LocalDate;

public final class TodoFixtures {

    private TodoFixtures() {}

    public static Todo completed(String title, int focusSeconds, int sessions) {
        return build(title, true, focusSeconds, sessions, LocalDate.parse("2026-05-28"));
    }

    public static Todo incomplete(String title, int focusSeconds, int sessions) {
        return build(title, false, focusSeconds, sessions, LocalDate.parse("2026-05-28"));
    }

    public static Todo on(LocalDate date, String title, boolean done, int focusSeconds, int sessions) {
        return build(title, done, focusSeconds, sessions, date);
    }

    private static Todo build(String title, boolean done, int focusSeconds, int sessions, LocalDate date) {
        try {
            Todo t = Todo.create("user-1", title, null, date, 0, 0);
            setField(t, "done", done);
            setField(t, "sessionFocusSeconds", focusSeconds);
            setField(t, "sessionCount", sessions);
            return t;
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static void setField(Object target, String name, Object value) throws Exception {
        Field f = Todo.class.getDeclaredField(name);
        f.setAccessible(true);
        f.set(target, value);
    }
}
