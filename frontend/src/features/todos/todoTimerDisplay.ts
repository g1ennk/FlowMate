type SessionRecord = { focusMs: number; breakMs: number }

type TodoTimerDisplayArgs = {
  isDone: boolean
  focusSeconds: number
  isActiveTimer?: boolean
  activeTimerElapsedMs?: number
  activeTimerRemainingMs?: number
  breakElapsedMs?: number
  breakTargetMs?: number
  flexiblePhase?: 'focus' | 'break_suggested' | 'break_free' | null
  sessionHistory?: SessionRecord[]
  initialFocusMs?: number
}

export function getTodoDisplayTimeSeconds({
  isDone,
  focusSeconds,
  isActiveTimer,
  activeTimerElapsedMs,
  activeTimerRemainingMs,
  breakElapsedMs,
  breakTargetMs,
  flexiblePhase,
  sessionHistory = [],
  initialFocusMs = 0,
}: TodoTimerDisplayArgs) {
  let displayTimeSeconds: number

  let sessionHistoryFocusSeconds: number | null = null
  if (sessionHistory.length > 0) {
    const sessionHistoryTotalMs = sessionHistory.reduce((sum, s) => sum + s.focusMs, 0)

    if (activeTimerElapsedMs !== undefined && isActiveTimer) {
      const currentSessionFocusMs = Math.max(0, activeTimerElapsedMs - initialFocusMs)
      const totalAccumulatedMs = sessionHistoryTotalMs + currentSessionFocusMs
      sessionHistoryFocusSeconds = Math.floor(totalAccumulatedMs / 1000)
    } else {
      sessionHistoryFocusSeconds = Math.floor(sessionHistoryTotalMs / 1000)
    }
  }

  if (isDone) {
    displayTimeSeconds = sessionHistoryFocusSeconds ?? focusSeconds
  } else if (isActiveTimer) {
    if (flexiblePhase === 'break_suggested' && breakTargetMs && breakElapsedMs !== undefined) {
      if (breakElapsedMs >= breakTargetMs) {
        const extraMs = breakElapsedMs - breakTargetMs
        displayTimeSeconds = Math.floor(extraMs / 1000)
      } else {
        const remainingMs = Math.max(0, breakTargetMs - breakElapsedMs)
        displayTimeSeconds = Math.ceil(remainingMs / 1000)
      }
    } else if (flexiblePhase === 'break_free' && breakElapsedMs !== undefined) {
      displayTimeSeconds = Math.floor(breakElapsedMs / 1000)
    } else if (activeTimerRemainingMs !== undefined) {
      displayTimeSeconds = Math.ceil(activeTimerRemainingMs / 1000)
    } else if (activeTimerElapsedMs !== undefined) {
      if (sessionHistory.length > 0) {
        displayTimeSeconds = sessionHistoryFocusSeconds ?? Math.floor(activeTimerElapsedMs / 1000)
      } else {
        displayTimeSeconds = Math.floor(activeTimerElapsedMs / 1000)
      }
    } else {
      displayTimeSeconds = sessionHistoryFocusSeconds ?? focusSeconds
    }
  } else {
    displayTimeSeconds = sessionHistoryFocusSeconds ?? focusSeconds
  }

  return displayTimeSeconds
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
