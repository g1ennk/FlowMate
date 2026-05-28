package kr.io.flowmate.report.prompt;

import kr.io.flowmate.todo.domain.Todo;

import java.util.List;

public record TodoStats(
    int total,
    int completed,
    int incomplete,
    int totalFocus,
    int totalSessions,
    int completionRate
) {
    public static TodoStats compute(List<Todo> todos) {
        int total = todos.size();
        int completed = (int) todos.stream().filter(Todo::isDone).count();
        int incomplete = total - completed;
        int totalFocus = todos.stream().mapToInt(Todo::getSessionFocusSeconds).sum();
        int totalSessions = todos.stream().mapToInt(Todo::getSessionCount).sum();
        int completionRate = total == 0 ? 0 : (int) Math.round((double) completed / total * 100);
        return new TodoStats(total, completed, incomplete, totalFocus, totalSessions, completionRate);
    }
}
