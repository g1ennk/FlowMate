import { deriveSessionId, generateSessionId, isSessionId } from '../../lib/sessionId'
import type { SessionRecord, SingleTimerState } from './timerTypes'

export type SessionIdentity = {
  sessionSequenceSeed: string
  sessionSequence: number
  activeSessionId: string
}

function sessionFingerprint(timer: SingleTimerState) {
  return timer.sessions
    .map((session) => session.clientSessionId ?? `${session.sessionFocusSeconds}:${session.breakSeconds}`)
    .join(',')
}

export function createSessionIdentity(): SessionIdentity {
  const sessionSequenceSeed = generateSessionId()
  return {
    sessionSequenceSeed,
    sessionSequence: 0,
    activeSessionId: deriveSessionId(sessionSequenceSeed, 0),
  }
}

export function resolveSessionIdentity(
  todoId: string,
  timer: SingleTimerState,
): SessionIdentity {
  const ordinal = Math.max(0, Math.trunc(timer.sessionSequence ?? timer.sessions.length))
  const existingSeed = timer.sessionSequenceSeed
  const seed = existingSeed && isSessionId(existingSeed)
    ? existingSeed
    : deriveLegacySessionSeed(todoId, timer)
  const existingActive = timer.activeSessionId

  return {
    sessionSequenceSeed: seed,
    sessionSequence: ordinal,
    activeSessionId:
      existingActive && isSessionId(existingActive)
        ? existingActive
        : deriveSessionId(seed, ordinal),
  }
}

export function advanceSessionIdentity(
  todoId: string,
  timer: SingleTimerState,
): SessionIdentity {
  const current = resolveSessionIdentity(todoId, timer)
  const nextOrdinal = current.sessionSequence + 1
  return {
    sessionSequenceSeed: current.sessionSequenceSeed,
    sessionSequence: nextOrdinal,
    activeSessionId: deriveSessionId(current.sessionSequenceSeed, nextOrdinal),
  }
}

export function resolveSessionRecordId(
  todoId: string,
  timer: SingleTimerState,
  session: SessionRecord,
  index: number,
) {
  if (session.clientSessionId && isSessionId(session.clientSessionId)) {
    return session.clientSessionId
  }

  const identity = resolveSessionIdentity(todoId, timer)
  return deriveSessionId(identity.sessionSequenceSeed, Math.max(0, index))
}

function deriveLegacySessionSeed(todoId: string, timer: SingleTimerState) {
  const fingerprint = sessionFingerprint(timer)
  const anchor = timer.mode === 'pomodoro'
    ? [
        'pomodoro',
        timer.endAt && timer.settingsSnapshot
          ? timer.endAt - timer.settingsSnapshot.flowMin * 60_000
          : null,
        timer.cycleCount,
        timer.phase,
        fingerprint,
      ]
    : [
        'stopwatch',
        timer.initialFocusMs ?? 0,
        timer.sessions.length,
        fingerprint,
      ]

  return deriveSessionId(`${todoId}:${anchor.join(':')}`, 0)
}
