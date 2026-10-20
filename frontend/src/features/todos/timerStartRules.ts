import type { SingleTimerState, TimerMode } from '../timer/timerTypes'
import type { Todo } from '../../api/types'
import { toastMessages } from '../../lib/messages'

export const TIMER_MODE_NAMES: Record<TimerMode, string> = {
  stopwatch: '일반 타이머',
  pomodoro: '뽀모도로',
}

// 타이머 모드 고르기 항목(할 일 메뉴 시트와 집중 시작 메뉴 StartFocusMenu가 같이 쓴다). 일반 타이머는 초록, 뽀모도로는 빨강
export const TIMER_MODE_OPTIONS: ReadonlyArray<{ mode: TimerMode; label: string; color: string }> = [
  { mode: 'stopwatch', label: '일반 타이머', color: 'text-icon-green' },
  { mode: 'pomodoro', label: '뽀모도로 타이머', color: 'text-icon-red' },
]

export type TimerStartBlock =
  | { kind: 'completed' }
  // 다른 할 일의 타이머가 실행 중이다(동시에 둘은 돌리지 않는다)
  | { kind: 'otherRunning'; todoId: string }
  // 같은 할 일에 다른 모드 타이머가 실행 중이다
  | { kind: 'sameTodoRunning'; mode: TimerMode }
  // 같은 할 일에 다른 모드 타이머가 멈춰 있다(일시정지, 단계 대기). 메뉴 시트는 그 모드를 막고 이유를 보여 준다(그대로 열면 멈춘 기록이 초기화된다)
  | { kind: 'sameTodoPaused'; mode: TimerMode }

/**
 * mode로 이 할 일의 타이머를 열거나 시작할 수 없는 이유. 없으면 null.
 * 메뉴 시트의 모드 항목과 행의 집중 시작 버튼이 같은 규칙을 쓴다.
 */
export function getDisabledReason(
  todo: Pick<Todo, 'id' | 'isDone'>,
  mode: TimerMode,
  timers: Record<string, SingleTimerState>,
): TimerStartBlock | null {
  if (todo.isDone) return { kind: 'completed' }
  const otherRunning = Object.entries(timers).find(([todoId, timer]) => todoId !== todo.id && timer.status === 'running')
  if (otherRunning) return { kind: 'otherRunning', todoId: otherRunning[0] }
  const current = timers[todo.id]
  if (current && current.status !== 'idle' && current.mode !== mode) {
    return current.status === 'running'
      ? { kind: 'sameTodoRunning', mode: current.mode }
      : { kind: 'sameTodoPaused', mode: current.mode }
  }
  return null
}

export function getDisabledReasonMessage(block: TimerStartBlock, getTodoTitle: (todoId: string) => string | undefined) {
  switch (block.kind) {
    case 'completed':
      return toastMessages.timerBlockedCompleted
    case 'otherRunning': {
      const title = getTodoTitle(block.todoId)
      return title ? toastMessages.timerRunningOn(title) : toastMessages.timerRunningElsewhere
    }
    case 'sameTodoRunning':
      return toastMessages.timerSameTodoRunning(TIMER_MODE_NAMES[block.mode])
    case 'sameTodoPaused':
      return toastMessages.timerSameTodoPaused(TIMER_MODE_NAMES[block.mode])
  }
}

/**
 * 할 일 행 오른쪽에 ▶(집중 시작)를 둘지. 타이머를 한 번도 쓰지 않아 시간 줄이 없는 미완료 할 일에만 둔다.
 * 기록이 있거나 진행 중인 할 일은 제목 아래 시간 줄로 타이머에 간다(사용자 결정 2026-10-20). 행과 코치마크가 같이 쓴다
 */
export function showsStartButton({ isDone, focusSeconds, hasActiveTimer }: { isDone: boolean; focusSeconds: number; hasActiveTimer: boolean }) {
  return !isDone && focusSeconds === 0 && !hasActiveTimer
}
