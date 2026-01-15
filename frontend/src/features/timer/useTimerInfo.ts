import type { SingleTimerState } from './timerStore'

export function getTimerInfo(timer: SingleTimerState | undefined) {
  const isActiveTimer = timer && (timer.status === 'running' || timer.status === 'paused')
  
  let activeTimerElapsedMs: number | undefined = undefined
  let activeTimerRemainingMs: number | undefined = undefined
  let activeTimerPhase: 'flow' | 'short' | 'long' | undefined = undefined
  let breakElapsedMs: number | undefined = undefined
  let breakTargetMs: number | undefined = undefined
  let isBreakPhase: boolean = false
  let flexiblePhase: 'focus' | 'break_suggested' | 'break_free' | null = null
  
  if (isActiveTimer && timer) {
    if (timer.mode === 'stopwatch') {
      // Flexible 타이머
      flexiblePhase = timer.flexiblePhase
      if (timer.flexiblePhase === 'break_suggested' || timer.flexiblePhase === 'break_free') {
        // 휴식 중: 휴식 시간 표시
        // running 상태일 때만 실시간 delta 추가, paused/waiting 상태에서는 멈춤
        if (timer.breakStartedAt && timer.status === 'running') {
          const delta = Date.now() - timer.breakStartedAt
          breakElapsedMs = timer.breakElapsedMs + delta
        } else {
          // paused/waiting 상태: 이미 pause 시점의 값으로 저장된 breakElapsedMs 사용
          breakElapsedMs = timer.breakElapsedMs
        }
        breakTargetMs = timer.breakTargetMs ?? undefined
        isBreakPhase = true
        // 집중 시간도 함께 제공 (참고용)
        // running 상태일 때만 실시간 delta 추가, paused/waiting 상태에서는 멈춤
        if (timer.focusStartedAt && timer.status === 'running') {
          const delta = Date.now() - timer.focusStartedAt
          activeTimerElapsedMs = (timer.focusElapsedMs ?? timer.elapsedMs) + delta
        } else {
          // paused/waiting 상태: 이미 pause 시점의 값으로 저장된 focusElapsedMs 사용
          activeTimerElapsedMs = timer.focusElapsedMs ?? timer.elapsedMs
        }
      } else {
        // 집중 중: 집중 시간 표시
        // running 상태일 때만 실시간 delta 추가, paused/waiting 상태에서는 멈춤
        if (timer.focusStartedAt && timer.status === 'running') {
          const delta = Date.now() - timer.focusStartedAt
          activeTimerElapsedMs = (timer.focusElapsedMs ?? timer.elapsedMs) + delta
        } else {
          // paused/waiting 상태: 이미 pause 시점의 값으로 저장된 focusElapsedMs 사용
          activeTimerElapsedMs = timer.focusElapsedMs ?? timer.elapsedMs
        }
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
    breakTargetMs,
    isBreakPhase,
    flexiblePhase,
  }
}
