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

export function formatTimerSeconds(totalFocusSeconds: number) {
  const focusMin = Math.floor(totalFocusSeconds / 60)
  const focusSec = totalFocusSeconds % 60
  return `${focusMin}:${String(focusSec).padStart(2, '0')}`
}

export function formatTimerHoursMinutes(totalSeconds: number) {
  const totalMinutes = Math.floor(totalSeconds / 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours > 0) return `${hours}시간 ${minutes}분`
  return `${minutes}분`
}

export function formatTimerMinutesSeconds(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
