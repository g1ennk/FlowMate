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
                    + ", " + t.getSessionCount() + "세션)")
                .collect(Collectors.joining("\n"));

        String incompleteLines = incomplete.isEmpty()
            ? "(없음)"
            : incomplete.stream()
                .map(t -> "- " + t.getTitle()
                    + (t.getSessionFocusSeconds() > 0 ? " (집중 " + PromptTexts.focusTime(t.getSessionFocusSeconds()) + ")" : ""))
                .collect(Collectors.joining("\n"));

        return "사용자의 오늘 하루 활동 데이터입니다. KPT 회고 레포트를 작성해주세요.\n"
            + "\n"
            + "## 요약\n"
            + "- 전체 투두: " + todos.size() + "개 (완료 " + stats.completed() + ", 미완료 " + stats.incomplete() + ")\n"
            + "- 총 집중 시간: " + PromptTexts.focusTime(stats.totalFocus()) + " (" + stats.totalSessions() + "세션)\n"
            + "\n"
            + "## 완료한 투두\n"
            + completedLines + "\n"
            + "\n"
            + "## 미완료 투두\n"
            + incompleteLines + "\n"
            + "\n"
            + PromptTexts.COMMON_RULES + "\n"
            + "- keep: 오늘 잘한 것, 집중 패턴 분석\n"
            + "- problem: 아쉬운 것, 미완료 투두의 원인 분석\n"
            + "- try: 내일 구체적 행동 1개 제안";
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

        return "사용자의 이번 주 활동 데이터입니다. KPT 주간 회고 레포트를 작성해주세요.\n"
            + "\n"
            + "## 주간 요약\n"
            + "- 전체 투두: " + todos.size() + "개 (완료 " + stats.completed() + ", 완료율 " + stats.completionRate() + "%)\n"
            + "- 총 집중 시간: " + PromptTexts.focusTime(stats.totalFocus()) + " (" + stats.totalSessions() + "세션)\n"
            + "\n"
            + "## 요일별 현황\n"
            + dailySummaries + "\n"
            + "\n"
            + "## 미완료 투두\n"
            + incompleteLines + "\n"
            + "\n"
            + PromptTexts.COMMON_RULES + "\n"
            + "- 요일별 패턴, 트렌드 등 사용자가 못 보는 분석\n"
            + "- keep: 이번 주 잘한 것, 강한 요일\n"
            + "- problem: 반복되는 패턴, 약한 요일, 미완료 투두 원인\n"
            + "- try: 다음 주 루틴 제안 1개";
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
                + "위 목표 중 투두 데이터에서 실천 흔적이 보이는 것과 그렇지 않은 것을 분석해주세요.";
        }

        return "사용자의 이번 달 활동 데이터입니다. KPT 월간 회고 레포트를 작성해주세요.\n"
            + "\n"
            + "## 월간 요약\n"
            + "- 전체 투두: " + todos.size() + "개 (완료 " + stats.completed() + ", 완료율 " + stats.completionRate() + "%)\n"
            + "- 총 집중 시간: " + PromptTexts.focusTime(stats.totalFocus()) + " (" + stats.totalSessions() + "세션)\n"
            + "\n"
            + "## 주차별 현황\n"
            + weeklySummaries + "\n"
            + "\n"
            + "## 미완료 투두 (상위 10개)\n"
            + incompleteLines + "\n"
            + overflow + weeklyTrySection + "\n"
            + "\n"
            + PromptTexts.COMMON_RULES + "\n"
            + "- 월간 성장 추세, 정체 구간 등 장기 패턴 분석\n"
            + "- keep: 이번 달 성장, 최고 성과 주\n"
            + "- problem: 정체 구간, 목표 대비 갭, 미완료 투두 패턴\n"
            + "- try: 다음 달 방향성 제안 1개";
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
