import type { FlowmateTodo } from '../../flowmate-client/flowmate-client.service';
import { COMMON_RULES, computeTodoStats, focusTime } from './todo-stats';

export const DAILY_PROMPT_VERSION = 'daily.v2';

export function buildDailyPrompt(todos: FlowmateTodo[]): string {
  const { completed, incomplete, totalFocus, totalSessions } =
    computeTodoStats(todos);

  return `사용자의 오늘 하루 활동 데이터입니다. KPT 회고 레포트를 작성해주세요.

## 요약
- 전체 투두: ${todos.length}개 (완료 ${completed.length}, 미완료 ${incomplete.length})
- 총 집중 시간: ${focusTime(totalFocus)} (${totalSessions}세션)

## 완료한 투두
${completed.map((t) => `- ${t.title} (집중 ${focusTime(t.sessionFocusSeconds)}, ${t.sessionCount}세션)`).join('\n') || '(없음)'}

## 미완료 투두
${
  incomplete
    .map(
      (t) =>
        // 시간 투자 후 미완료와 시간 투자 없이 미완료를 구분 — Gemini가 problem에서 다르게 분석하도록 유도
        `- ${t.title}${t.sessionFocusSeconds > 0 ? ` (집중 ${focusTime(t.sessionFocusSeconds)})` : ''}`,
    )
    .join('\n') || '(없음)'
}

${COMMON_RULES}
- keep: 오늘 잘한 것, 집중 패턴 분석
- problem: 아쉬운 것, 미완료 투두의 원인 분석
- try: 내일 구체적 행동 1개 제안`;
}
