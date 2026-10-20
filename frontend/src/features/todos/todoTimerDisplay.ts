type TodoTimerDisplayArgs = {
  isDone: boolean
  sessionFocusSeconds: number
  isActiveTimer?: boolean
  activeTimerElapsedMs?: number
  activeTimerRemainingMs?: number
  breakElapsedMs?: number
  breakTargetMs?: number
  flexiblePhase?: 'focus' | 'break_suggested' | 'break_free' | null
}

// 행에 보이는 시간이 남은 시간인지(뽀모도로, 추천 휴식 안쪽). 일시정지 행은 이때 "남음"을 붙여 기록(누적)과 구분한다
export function isTodoDisplayTimeRemaining({
  isDone,
  isActiveTimer,
  activeTimerRemainingMs,
  breakElapsedMs,
  breakTargetMs,
  flexiblePhase,
}: TodoTimerDisplayArgs) {
  if (isDone || !isActiveTimer) return false
  if (flexiblePhase === 'break_suggested' && breakTargetMs && breakElapsedMs !== undefined) {
    return breakElapsedMs < breakTargetMs
  }
  if (flexiblePhase === 'break_free') return false
  return activeTimerRemainingMs !== undefined
}

export function getTodoDisplayTimeSeconds({
  isDone,
  sessionFocusSeconds,
  isActiveTimer,
  activeTimerElapsedMs,
  activeTimerRemainingMs,
  breakElapsedMs,
  breakTargetMs,
  flexiblePhase,
}: TodoTimerDisplayArgs) {
  if (isDone || !isActiveTimer) {
    return sessionFocusSeconds
  }

  if (flexiblePhase === 'break_suggested' && breakTargetMs && breakElapsedMs !== undefined) {
    if (breakElapsedMs >= breakTargetMs) {
      const extraMs = breakElapsedMs - breakTargetMs
      return Math.floor(extraMs / 1000)
    }
    const remainingMs = Math.max(0, breakTargetMs - breakElapsedMs)
    return Math.ceil(remainingMs / 1000)
  }

  if (flexiblePhase === 'break_free' && breakElapsedMs !== undefined) {
    return Math.floor(breakElapsedMs / 1000)
  }

  if (activeTimerRemainingMs !== undefined) {
    return Math.ceil(activeTimerRemainingMs / 1000)
  }

  if (activeTimerElapsedMs !== undefined) {
    // 일반 타이머 집중 중: 서버 누적(base) + 현재 런타임이 반영된 elapsed 값을 표시
    return Math.max(sessionFocusSeconds, Math.floor(activeTimerElapsedMs / 1000))
  }

  return sessionFocusSeconds
}
