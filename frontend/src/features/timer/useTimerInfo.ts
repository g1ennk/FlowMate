import type { SingleTimerState } from './timerStore'

export function getTimerInfo(timer: SingleTimerState | undefined) {
  const isActiveTimer = timer && (timer.status === 'running' || timer.status === 'paused')
  
  let activeTimerElapsedMs: number | undefined = undefined
  let activeTimerRemainingMs: number | undefined = undefined
  let activeTimerPhase: 'flow' | 'short' | 'long' | undefined = undefined
  let breakElapsedMs: number | undefined = undefined
  let isBreakPhase: boolean = false
  
  if (isActiveTimer && timer) {
    if (timer.mode === 'stopwatch') {
      // Flexible 타이머
      if (timer.flexiblePhase === 'break_suggested' || timer.flexiblePhase === 'break_free') {
        // 휴식 중: 휴식 시간 표시
        breakElapsedMs = timer.breakElapsedMs
        isBreakPhase = true
        // 집중 시간도 함께 제공 (참고용)
        activeTimerElapsedMs = timer.focusElapsedMs ?? timer.elapsedMs
      } else {
        // 집중 중: 집중 시간 표시
        activeTimerElapsedMs = timer.focusElapsedMs ?? timer.elapsedMs
      }
    } else if (timer.mode === 'pomodoro') {
      activeTimerRemainingMs = timer.endAt 
        ? Math.max(0, timer.endAt - Date.now()) 
        : (timer.remainingMs ?? 0)
      activeTimerPhase = timer.phase
    }
  }
  
  return {
    isActiveTimer,
    activeTimerElapsedMs,
    activeTimerRemainingMs,
    activeTimerPhase,
    timerMode: timer?.mode,
    breakElapsedMs,
    isBreakPhase,
  }
}
