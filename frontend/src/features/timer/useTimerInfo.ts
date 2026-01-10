import type { SingleTimerState } from './timerStore'

export function getTimerInfo(timer: SingleTimerState | undefined) {
  const isActiveTimer = timer && (timer.status === 'running' || timer.status === 'paused')
  
  let activeTimerElapsedMs: number | undefined = undefined
  let activeTimerRemainingMs: number | undefined = undefined
  let activeTimerPhase: 'flow' | 'short' | 'long' | undefined = undefined
  
  if (isActiveTimer && timer) {
    if (timer.mode === 'stopwatch') {
      activeTimerElapsedMs = timer.elapsedMs
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
  }
}
