import type { SessionRecord } from '../features/timer/timerTypes'

export function getSessionsTotalFocusMs(sessions: SessionRecord[]): number {
  return sessions.reduce((sum, session) => sum + session.sessionFocusSeconds * 1000, 0)
}
