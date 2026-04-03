import { FlowmateTodo } from '../../flowmate-client/flowmate-client.service';
import {
  computeTodoStats,
  focusTime,
  groupFocusSummary,
  COMMON_RULES,
} from './todo-stats';

export const WEEKLY_PROMPT_VERSION = 'weekly.v2';

export function buildWeeklyPrompt(todos: FlowmateTodo[]): string {
  const byDate = new Map<string, FlowmateTodo[]>();
  for (const t of todos) {
    const list = byDate.get(t.date) ?? [];
    list.push(t);
    byDate.set(t.date, list);
  }

  const { completed, incomplete, totalFocus, totalSessions, completionRate } =
    computeTodoStats(todos);

  const dailySummaries = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, items]) => {
      const { done, focus } = groupFocusSummary(items);
      return `- ${date}: ${items.length}개 중 ${done}개 완료, 집중 ${focusTime(focus)}분`;
    })
    .join('\n');

  return `사용자의 이번 주 활동 데이터입니다. KPT 주간 회고 레포트를 작성해주세요.

## 주간 요약
- 전체 투두: ${todos.length}개 (완료 ${completed.length}, 완료율 ${completionRate}%)
- 총 집중 시간: ${focusTime(totalFocus)}분 (${totalSessions}세션)

## 요일별 현황
${dailySummaries || '(데이터 없음)'}

## 미완료 투두
${incomplete.map((t) => `- ${t.title} (${t.date})${t.sessionFocusSeconds > 0 ? ` — 집중 ${focusTime(t.sessionFocusSeconds)}분 투자했으나 미완료` : ''}`).join('\n') || '(없음)'}

${COMMON_RULES}
- 요일별 패턴, 트렌드 등 사용자가 못 보는 분석
- keep: 이번 주 잘한 것, 강한 요일
- problem: 반복되는 패턴, 약한 요일, 미완료 투두 원인
- try: 다음 주 루틴 제안 1개`;
}
