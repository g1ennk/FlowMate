package kr.io.flowmate.report.prompt;

import kr.io.flowmate.review.domain.Review;
import kr.io.flowmate.review.domain.ReviewType;
import kr.io.flowmate.todo.domain.Todo;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

import static org.assertj.core.api.Assertions.assertThat;

@DisplayName("ReportPrompts")
class ReportPromptsTest {

    @Nested
    @DisplayName("daily")
    class Daily {
        @Test
        void matchesSnapshot() throws Exception {
            List<Todo> todos = List.of(
                TodoFixtures.completed("JWT 구현", 4500, 3),
                TodoFixtures.completed("React Query 학습", 1800, 1),
                TodoFixtures.incomplete("데모 시나리오 작성", 1500, 1),
                TodoFixtures.incomplete("운동", 0, 0)
            );
            assertThat(ReportPrompts.daily(todos)).isEqualTo(loadSnapshot("daily-prompt.v2.txt"));
        }
    }

    @Nested
    @DisplayName("weekly")
    class Weekly {
        @Test
        void matchesSnapshot() throws Exception {
            List<Todo> todos = List.of(
                TodoFixtures.on(LocalDate.of(2026, 5, 25), "JWT 구현",              true,  4500, 3),
                TodoFixtures.on(LocalDate.of(2026, 5, 26), "CI 파이프라인",          true,  3600, 2),
                TodoFixtures.on(LocalDate.of(2026, 5, 27), "OAuth 통합",            false, 1800, 1),
                TodoFixtures.on(LocalDate.of(2026, 5, 28), "AI 마이그레이션 분석",  true,  5400, 3),
                TodoFixtures.on(LocalDate.of(2026, 5, 29), "데모 시나리오",          false, 0,    0)
            );
            assertThat(ReportPrompts.weekly(todos)).isEqualTo(loadSnapshot("weekly-prompt.v2.txt"));
        }
    }

    @Nested
    @DisplayName("monthly")
    class Monthly {

        private List<Todo> fewIncomplete() {
            return List.of(
                TodoFixtures.on(LocalDate.of(2026, 5, 25), "JWT 구현",              true,  4500, 3),
                TodoFixtures.on(LocalDate.of(2026, 5, 26), "CI 파이프라인",          true,  3600, 2),
                TodoFixtures.on(LocalDate.of(2026, 5, 27), "OAuth 통합",            false, 1800, 1),
                TodoFixtures.on(LocalDate.of(2026, 5, 28), "AI 마이그레이션 분석",  true,  5400, 3),
                TodoFixtures.on(LocalDate.of(2026, 5, 29), "데모 시나리오",          false, 0,    0)
            );
        }

        private List<Todo> manyIncomplete() {
            List<Todo> out = new ArrayList<>();
            for (int i = 0; i < 12; i++) {
                int day = (i % 28) + 1;
                out.add(TodoFixtures.on(
                    LocalDate.of(2026, 5, day),
                    "미완료 항목 " + (i + 1),
                    false, 0, 0));
            }
            return out;
        }

        private List<Review> sampleReviews() {
            return List.of(
                Review.create("user-1", ReviewType.WEEKLY,
                    LocalDate.of(2026, 5, 4), LocalDate.of(2026, 5, 10),
                    "[Try] 매일 한 가지에 90분 몰입하기"),
                Review.create("user-1", ReviewType.WEEKLY,
                    LocalDate.of(2026, 5, 11), LocalDate.of(2026, 5, 17),
                    "💡 Try 더 일찍 자기")
            );
        }

        @Test
        void matchesSnapshot_noOverflow_withReview() throws Exception {
            assertThat(ReportPrompts.monthly(fewIncomplete(), sampleReviews()))
                .isEqualTo(loadSnapshot("monthly-prompt.v2.no-overflow-with-review.txt"));
        }

        @Test
        void matchesSnapshot_noOverflow_noReview() throws Exception {
            assertThat(ReportPrompts.monthly(fewIncomplete(), List.of()))
                .isEqualTo(loadSnapshot("monthly-prompt.v2.no-overflow-no-review.txt"));
        }

        @Test
        void matchesSnapshot_overflow_noReview() throws Exception {
            assertThat(ReportPrompts.monthly(manyIncomplete(), List.of()))
                .isEqualTo(loadSnapshot("monthly-prompt.v2.overflow-no-review.txt"));
        }

        @Test
        void matchesSnapshot_overflow_withReview() throws Exception {
            assertThat(ReportPrompts.monthly(manyIncomplete(), sampleReviews()))
                .isEqualTo(loadSnapshot("monthly-prompt.v2.overflow-with-review.txt"));
        }
    }

    @Nested
    @DisplayName("extractTry")
    class ExtractTry {
        @Test
        void parsesBracketAndEmoji() {
            assertThat(ReportPrompts.extractTry("[Try] 매일 한 가지에 90분 몰입하기")).isEqualTo("매일 한 가지에 90분 몰입하기");
            assertThat(ReportPrompts.extractTry("[try] 소문자")).isEqualTo("소문자");
            assertThat(ReportPrompts.extractTry("[TRY] 대문자")).isEqualTo("대문자");
            assertThat(ReportPrompts.extractTry("💡 Try 더 일찍 자기")).isEqualTo("더 일찍 자기");
            assertThat(ReportPrompts.extractTry("그냥 내용")).isNull();
            assertThat(ReportPrompts.extractTry(null)).isNull();
        }
    }

    @Nested
    @DisplayName("weekNum")
    class WeekNum {
        @Test
        void mapsDayToWeek() {
            assertThat(ReportPrompts.weekNum(1)).isEqualTo(1);
            assertThat(ReportPrompts.weekNum(7)).isEqualTo(1);
            assertThat(ReportPrompts.weekNum(8)).isEqualTo(2);
            assertThat(ReportPrompts.weekNum(22)).isEqualTo(4);
            assertThat(ReportPrompts.weekNum(29)).isEqualTo(5);
        }
    }

    private static String loadSnapshot(String name) throws IOException {
        try (var in = Objects.requireNonNull(
                ReportPromptsTest.class.getClassLoader().getResourceAsStream("snapshots/" + name))) {
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
    }
}
