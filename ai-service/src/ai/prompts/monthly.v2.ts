import type { FlowmateReview } from '../../flowmate-client/flowmate-client.service';
import { FlowmateTodo } from '../../flowmate-client/flowmate-client.service';
import {
  COMMON_RULES,
  computeTodoStats,
  focusTime,
  groupFocusSummary,
} from './todo-stats';

export const MONTHLY_PROMPT_VERSION = 'monthly.v2';

function extractTryFromContent(content: string): string | null {
  // [Try] 브라켓 형식 + 💡 Try 이모지 형식 (formatReportAsKpt 출력) 둘 다 인식
  const bracketMatch = content.match(/\[try\]\s*(.*)/i);
  if (bracketMatch) return bracketMatch[1].trim();
  const emojiMatch = content.match(/💡\s*Try\s*(.*)/);
  if (emojiMatch) return emojiMatch[1].trim();
  return null;
}

export function buildMonthlyPrompt(
  todos: FlowmateTodo[],
  weeklyReviews?: FlowmateReview[],
): string {
  const { completed, incomplete, totalFocus, totalSessions, completionRate } =
    computeTodoStats(todos);

  const byWeek = new Map<number, FlowmateTodo[]>();
  for (const t of todos) {
    const day = Number(t.date.split('-')[2]);
    const weekNum = Math.ceil(day / 7);
    const list = byWeek.get(weekNum) ?? [];
    list.push(t);
    byWeek.set(weekNum, list);
  }

  const weeklySummaries = [...byWeek.entries()]
    .sort(([a], [b]) => a - b)
    .map(([week, items]) => {
      const { done, focus } = groupFocusSummary(items);
      return `- ${week}주차: ${items.length}개 중 ${done}개 완료, 집중 ${focusTime(focus)}분`;
    })
    .join('\n');

  let weeklyTrySection = '';
  if (weeklyReviews && weeklyReviews.length > 0) {
    const tries = weeklyReviews
      .sort((a, b) => a.periodStart.localeCompare(b.periodStart))
      .map((r) => {
        const tryText = extractTryFromContent(r.content);
        return `- ${r.periodStart}: ${tryText ?? '(Try 없음)'}`;
      })
      .join('\n');
    weeklyTrySection = `\n\n## 사용자의 주간 목표 (Try)
${tries}

위 목표 중 투두 데이터에서 실천 흔적이 보이는 것과 그렇지 않은 것을 분석해주세요.`;
  }

  return `사용자의 이번 달 활동 데이터입니다. KPT 월간 회고 레포트를 작성해주세요.

## 월간 요약
- 전체 투두: ${todos.length}개 (완료 ${completed.length}, 완료율 ${completionRate}%)
- 총 집중 시간: ${focusTime(totalFocus)} (${totalSessions}세션)

## 주차별 현황
${weeklySummaries || '(데이터 없음)'}

## 미완료 투두 (상위 10개)
${
  incomplete
    .slice(0, 10)
    .map((t) => `- ${t.title} (${t.date})`)
    .join('\n') || '(없음)'
}
${incomplete.length > 10 ? `외 ${incomplete.length - 10}개` : ''}${weeklyTrySection}

${COMMON_RULES}
- 월간 성장 추세, 정체 구간 등 장기 패턴 분석
- keep: 이번 달 성장, 최고 성과 주
- problem: 정체 구간, 목표 대비 갭, 미완료 투두 패턴
- try: 다음 달 방향성 제안 1개`;
}
