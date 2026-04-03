import { FlowmateTodo } from '../../flowmate-client/flowmate-client.service';

export function computeTodoStats(todos: FlowmateTodo[]) {
  const completed = todos.filter((t) => t.isDone);
  const incomplete = todos.filter((t) => !t.isDone);
  const totalFocus = todos.reduce((sum, t) => sum + t.sessionFocusSeconds, 0);
  const totalSessions = todos.reduce((sum, t) => sum + t.sessionCount, 0);
  const completionRate =
    todos.length > 0 ? Math.round((completed.length / todos.length) * 100) : 0;

  return { completed, incomplete, totalFocus, totalSessions, completionRate };
}

export function focusTime(seconds: number): string {
  const total = Math.round(seconds / 60);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours > 0) return `${hours}시간 ${minutes}분`;
  return `${minutes}분`;
}

export function groupFocusSummary(items: FlowmateTodo[]): {
  done: number;
  focus: number;
} {
  return {
    done: items.filter((i) => i.isDone).length,
    focus: items.reduce((s, i) => s + i.sessionFocusSeconds, 0),
  };
}

export const COMMON_RULES = `## 규칙
- 한국어로 작성
- 각 섹션 2~3문장, 전체 500자 이내`;
