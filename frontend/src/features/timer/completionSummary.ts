import { MIN_FLOW_MS } from '../../lib/constants'
import { getSessionsTotalFocusMs } from '../../lib/stopwatchMetrics'
import { getPomodoroElapsedMs } from './timerHelpers'
import type { SingleTimerState } from './timerTypes'

export type CompletionSummary = {
  // 완료하면 기록되는 집중 횟수(이미 기록된 세션 + 지금 진행 중인 집중)
  count: number
  focusMs: number
}

/**
 * 할 일 완료 확인에 보여 줄 집중 횟수와 시간.
 * count가 0이면 기록할 것이 없으므로 확인 없이 완료한다(.impeccable.md §8).
 */
export function getCompletionSummary(
  timer: SingleTimerState | undefined,
  plannedMs: number,
): CompletionSummary {
  if (!timer) return { count: 0, focusMs: 0 }
  const sessions = timer.sessions ?? []

  if (timer.mode === 'stopwatch') {
    const currentSessionMs = Math.max(0, (timer.focusElapsedMs ?? 0) - (timer.initialFocusMs ?? 0))
    // 기록에는 이미 MIN_FLOW_MS 이상인 세션만 있다. 현재 세션도 같은 기준을 넘어야 기록된다
    const isCurrentSessionValid = currentSessionMs >= MIN_FLOW_MS
    return {
      count: sessions.length + (isCurrentSessionValid ? 1 : 0),
      focusMs: getSessionsTotalFocusMs(sessions) + (isCurrentSessionValid ? currentSessionMs : 0),
    }
  }

  // 뽀모도로: 휴식 중이면 이미 sessions에 들어 있다. 집중 단계면 완료 기록(completePomodoro)과 같은 기준으로
  // 지난 시간이 MIN_FLOW_MS 이상일 때만 센다. 다음 집중을 기다리는 중(waiting)은 지난 시간이 0이다
  const currentFlowMs = timer.phase === 'flow' ? getPomodoroElapsedMs(timer, plannedMs) : 0
  const isCurrentFlowRecorded = currentFlowMs >= MIN_FLOW_MS
  return {
    count: sessions.length + (isCurrentFlowRecorded ? 1 : 0),
    focusMs: getSessionsTotalFocusMs(sessions) + (isCurrentFlowRecorded ? currentFlowMs : 0),
  }
}
