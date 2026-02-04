import {
  getCurrentSessionFocusMs,
  getSessionsTotalFocusMs,
  getTotalAccumulatedFocusMs,
} from '../../lib/stopwatchMetrics'

type SessionRecord = { sessionFocusSeconds: number; breakSeconds: number }

type TodoTimerDisplayArgs = {
  isDone: boolean
  sessionFocusSeconds: number
  isActiveTimer?: boolean
  activeTimerElapsedMs?: number
  activeTimerRemainingMs?: number
  breakElapsedMs?: number
  breakTargetMs?: number
  flexiblePhase?: 'focus' | 'break_suggested' | 'break_free' | null
  sessions?: SessionRecord[]
  initialFocusMs?: number
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
  sessions = [],
  initialFocusMs = 0,
}: TodoTimerDisplayArgs) {
  let displayTimeSeconds: number

  const sessionsTotalMs = getSessionsTotalFocusMs(sessions)
  const sessionsFocusSeconds = sessions.length > 0 ? Math.floor(sessionsTotalMs / 1000) : null
  const accumulatedFocusSeconds =
    sessions.length > 0 && activeTimerElapsedMs !== undefined && isActiveTimer
      ? Math.floor(
        getTotalAccumulatedFocusMs(activeTimerElapsedMs, initialFocusMs, sessions) / 1000,
      )
      : sessionsFocusSeconds

  if (isDone) {
    // 완료된 항목은 확정 세션 합계를 우선 사용해 이중 집계를 방지한다.
    displayTimeSeconds = sessionsFocusSeconds ?? sessionFocusSeconds
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
      if (sessions.length > 0) {
        displayTimeSeconds = accumulatedFocusSeconds ?? Math.floor(activeTimerElapsedMs / 1000)
      } else {
        const currentSessionMs = getCurrentSessionFocusMs(activeTimerElapsedMs, initialFocusMs, [])
        displayTimeSeconds = Math.floor(currentSessionMs / 1000)
      }
    } else {
      displayTimeSeconds = sessionsFocusSeconds ?? sessionFocusSeconds
    }
  } else {
    displayTimeSeconds = sessionsFocusSeconds ?? sessionFocusSeconds
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
