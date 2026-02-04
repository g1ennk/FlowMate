import type { SessionRecord } from '../features/timer/timerTypes'

export function getSessionsTotalFocusMs(sessions: SessionRecord[]): number {
  return sessions.reduce((sum, session) => sum + session.sessionFocusSeconds * 1000, 0)
}

export function getStopwatchBaselineMs(initialFocusMs: number, sessions: SessionRecord[]): number {
  const sessionsTotalMs = getSessionsTotalFocusMs(sessions)
  return Math.max(initialFocusMs, sessionsTotalMs)
}

export function getCurrentSessionFocusMs(
  focusElapsedMs: number,
  initialFocusMs: number,
  sessions: SessionRecord[],
): number {
  const baselineMs = getStopwatchBaselineMs(initialFocusMs, sessions)
  return Math.max(0, focusElapsedMs - baselineMs)
}

export function getTotalAccumulatedFocusMs(
  focusElapsedMs: number,
  initialFocusMs: number,
  sessions: SessionRecord[],
): number {
  const currentSessionFocusMs = getCurrentSessionFocusMs(focusElapsedMs, initialFocusMs, sessions)
  return getSessionsTotalFocusMs(sessions) + currentSessionFocusMs
}
