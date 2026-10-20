package kr.io.flowmate.report.prompt;

import kr.io.flowmate.review.domain.Review;
import kr.io.flowmate.todo.domain.Todo;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

public final class ReportPrompts {

    private static final Pattern TRY_BRACKET = Pattern.compile("\\[try\\]\\s*(.*)", Pattern.CASE_INSENSITIVE);
    private static final Pattern TRY_EMOJI = Pattern.compile("💡\\s*Try\\s*(.*)");

    private ReportPrompts() {}

    public static String daily(List<Todo> todos) {
        TodoStats stats = TodoStats.compute(todos);
        List<Todo> completed = todos.stream().filter(Todo::isDone).toList();
        List<Todo> incomplete = todos.stream().filter(t -> !t.isDone()).toList();

        String completedLines = completed.isEmpty()
            ? "(없음)"
            : completed.stream()
                .map(t -> "- " + t.getTitle() + " (집중 " + PromptTexts.focusTime(t.getSessionFocusSeconds())
                    + ", 집중 " + t.getSessionCount() + "회)")
                .collect(Collectors.joining("\n"));

        String incompleteLines = incomplete.isEmpty()
            ? "(없음)"
            : incomplete.stream()
                .map(t -> "- " + t.getTitle()
                    + (t.getSessionFocusSeconds() > 0 ? " (집중 " + PromptTexts.focusTime(t.getSessionFocusSeconds()) + ")" : ""))
                .collect(Collectors.joining("\n"));

        return "사용자의 오늘 하루 활동 데이터입니다. 하루 요약을 작성해주세요.\n"
            + "\n"
            + "## 요약\n"
            + "- 전체 할 일: " + todos.size() + "개 (완료 " + stats.completed() + ", 미완료 " + stats.incomplete() + ")\n"
            + "- 총 집중 시간: " + PromptTexts.focusTime(stats.totalFocus()) + " (집중 " + stats.totalSessions() + "회)\n"
            + "\n"
            + "## 완료한 할 일\n"
            + completedLines + "\n"
            + "\n"
            + "## 미완료 할 일\n"
            + incompleteLines + "\n"
            + "\n"
            + PromptTexts.COMMON_RULES + "\n"
            + "- keep: 오늘 한 일 요약. 완료한 할 일과 집중 횟수 같은 사실 위주\n"
            + "- problem: 눈에 띈 점. 미완료 할 일, 집중이 몰린 할 일 같은 관찰만 쓰고 원인 추측이나 지적은 하지 않음\n"
            + "- try: 내일 해 볼 만한 것 1개를 가볍게 제안";
    }

    public static String weekly(List<Todo> todos) {
        TodoStats stats = TodoStats.compute(todos);
        List<Todo> incomplete = todos.stream().filter(t -> !t.isDone()).toList();

        // 날짜별 그룹 — TreeMap으로 자동 오름차순 정렬
        Map<LocalDate, List<Todo>> byDate = todos.stream()
            .collect(Collectors.groupingBy(Todo::getDate, TreeMap::new, Collectors.toList()));

        String dailySummaries = byDate.isEmpty()
            ? "(데이터 없음)"
            : byDate.entrySet().stream()
                .map(e -> {
                    List<Todo> items = e.getValue();
                    int done = (int) items.stream().filter(Todo::isDone).count();
                    int focus = items.stream().mapToInt(Todo::getSessionFocusSeconds).sum();
                    return "- " + e.getKey() + ": " + items.size() + "개 중 " + done
                        + "개 완료, 집중 " + PromptTexts.focusTime(focus);
                })
                .collect(Collectors.joining("\n"));

        String incompleteLines = incomplete.isEmpty()
            ? "(없음)"
            : incomplete.stream()
                .map(t -> "- " + t.getTitle() + " (" + t.getDate() + ")"
                    + (t.getSessionFocusSeconds() > 0
                        ? " — 집중 " + PromptTexts.focusTime(t.getSessionFocusSeconds()) + " 투자했으나 미완료"
                        : ""))
                .collect(Collectors.joining("\n"));

        return "사용자의 이번 주 활동 데이터입니다. 한 주 요약을 작성해주세요.\n"
            + "\n"
            + "## 주간 요약\n"
            + "- 전체 할 일: " + todos.size() + "개 (완료 " + stats.completed() + ", 완료율 " + stats.completionRate() + "%)\n"
            + "- 총 집중 시간: " + PromptTexts.focusTime(stats.totalFocus()) + " (집중 " + stats.totalSessions() + "회)\n"
            + "\n"
            + "## 요일별 현황\n"
            + dailySummaries + "\n"
            + "\n"
            + "## 미완료 할 일\n"
            + incompleteLines + "\n"
            + "\n"
            + PromptTexts.COMMON_RULES + "\n"
            + "- keep: 이번 주 한 일 요약. 완료한 할 일, 집중 횟수, 집중이 많았던 요일 같은 사실 위주\n"
            + "- problem: 눈에 띈 점. 반복되어 보이는 패턴, 미완료 할 일 같은 관찰만 쓰고 원인 추측이나 지적은 하지 않음\n"
            + "- try: 다음 주에 해 볼 만한 것 1개를 가볍게 제안";
    }

    public static String monthly(List<Todo> todos, List<Review> weeklyReviews) {
        TodoStats stats = TodoStats.compute(todos);
        List<Todo> incomplete = todos.stream().filter(t -> !t.isDone()).toList();

        // 주차별 그룹 — TreeMap 자동 오름차순
        Map<Integer, List<Todo>> byWeek = todos.stream()
            .collect(Collectors.groupingBy(
                t -> weekNum(t.getDate().getDayOfMonth()),
                TreeMap::new,
                Collectors.toList()));

        String weeklySummaries = byWeek.isEmpty()
            ? "(데이터 없음)"
            : byWeek.entrySet().stream()
                .map(e -> {
                    List<Todo> items = e.getValue();
                    int done = (int) items.stream().filter(Todo::isDone).count();
                    int focus = items.stream().mapToInt(Todo::getSessionFocusSeconds).sum();
                    return "- " + e.getKey() + "주차: " + items.size() + "개 중 " + done
                        + "개 완료, 집중 " + PromptTexts.focusTime(focus);
                })
                .collect(Collectors.joining("\n"));

        // 미완료 상위 10개 + overflow 표시
        List<Todo> topIncomplete = incomplete.size() > 10 ? incomplete.subList(0, 10) : incomplete;
        String incompleteLines = topIncomplete.isEmpty()
            ? "(없음)"
            : topIncomplete.stream()
                .map(t -> "- " + t.getTitle() + " (" + t.getDate() + ")")
                .collect(Collectors.joining("\n"));
        String overflow = incomplete.size() > 10 ? "외 " + (incomplete.size() - 10) + "개" : "";

        // weeklyReviews 있을 때만 섹션 추가
        String weeklyTrySection = "";
        if (weeklyReviews != null && !weeklyReviews.isEmpty()) {
            List<Review> sorted = new ArrayList<>(weeklyReviews);
            sorted.sort(Comparator.comparing(Review::getPeriodStart));
            String tries = sorted.stream()
                .map(r -> {
                    String tryText = extractTry(r.getContent());
                    return "- " + r.getPeriodStart() + ": " + (tryText != null ? tryText : "(Try 없음)");
                })
                .collect(Collectors.joining("\n"));
            weeklyTrySection = "\n\n## 사용자의 주간 목표 (Try)\n"
                + tries + "\n"
                + "\n"
                + "위 목표 중 할 일 데이터에서 실천한 흔적이 보이는 것이 있으면 keep에서 사실로만 짚어 주세요.";
        }

        return "사용자의 이번 달 활동 데이터입니다. 한 달 요약을 작성해주세요.\n"
            + "\n"
            + "## 월간 요약\n"
            + "- 전체 할 일: " + todos.size() + "개 (완료 " + stats.completed() + ", 완료율 " + stats.completionRate() + "%)\n"
            + "- 총 집중 시간: " + PromptTexts.focusTime(stats.totalFocus()) + " (집중 " + stats.totalSessions() + "회)\n"
            + "\n"
            + "## 주차별 현황\n"
            + weeklySummaries + "\n"
            + "\n"
            + "## 미완료 할 일 (상위 10개)\n"
            + incompleteLines + "\n"
            + overflow + weeklyTrySection + "\n"
            + "\n"
            + PromptTexts.COMMON_RULES + "\n"
            + "- keep: 이번 달 한 일 요약. 완료한 할 일, 집중 횟수, 집중이 많았던 주차 같은 사실 위주\n"
            + "- problem: 눈에 띈 점. 집중이 줄어든 주차, 미완료 할 일 패턴 같은 관찰만 쓰고 원인 추측이나 지적은 하지 않음\n"
            + "- try: 다음 달에 해 볼 만한 것 1개를 가볍게 제안";
    }

    static String extractTry(String content) {
        if (content == null) return null;
        Matcher b = TRY_BRACKET.matcher(content);
        if (b.find()) return b.group(1).trim();
        Matcher e = TRY_EMOJI.matcher(content);
        if (e.find()) return e.group(1).trim();
        return null;
    }

    static int weekNum(int day) {
        return (int) Math.ceil(day / 7.0);
    }
}
