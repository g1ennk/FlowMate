import { describe, expect, it, vi } from 'vitest'
import { hydrateState } from './timerHydration'
import {
  advanceSessionIdentity,
  createSessionIdentity,
  resolveSessionIdentity,
} from './timerSessionIdentity'
import type { SingleTimerState } from './timerTypes'
import { getSessionSignature } from './useStopwatchSessionSync'

const TODO_ID = 'todo-identity'

function createLegacyStopwatch(overrides: Partial<SingleTimerState> = {}): SingleTimerState {
  return {
    mode: 'stopwatch',
    phase: 'flow',
    status: 'running',
    endAt: null,
    remainingMs: null,
    elapsedMs: 4_522_000,
    initialFocusMs: 0,
    startedAt: null,
    cycleCount: 0,
    settingsSnapshot: null,
    flexiblePhase: 'focus',
    focusElapsedMs: 4_522_000,
    breakElapsedMs: 0,
    breakTargetMs: null,
    breakCompleted: false,
    focusStartedAt: 1_700_000_000_000,
    breakStartedAt: null,
    breakSessionPendingUpdate: false,
    sessions: [],
    ...overrides,
  }
}

describe('timer session identity', () => {
  it('derives the same id for independent writers with the same legacy snapshot', () => {
    const timer = createLegacyStopwatch()

    expect(resolveSessionIdentity(TODO_ID, timer)).toEqual(
      resolveSessionIdentity(TODO_ID, { ...timer, sessions: [] }),
    )
  })

  it('derives a different legacy id when the stable focus baseline changes', () => {
    const first = resolveSessionIdentity(TODO_ID, createLegacyStopwatch())
    const second = resolveSessionIdentity(
      TODO_ID,
      createLegacyStopwatch({ initialFocusMs: 4_522_000 }),
    )

    expect(first.activeSessionId).not.toBe(second.activeSessionId)
  })

  it('keeps legacy identity stable when runtimes hydrate at different times', () => {
    const timer = createLegacyStopwatch({
      sessions: [{ sessionFocusSeconds: 600, breakSeconds: 60 }],
    })
    vi.useFakeTimers()
    vi.setSystemTime(1_800_000_000_000)
    const first = hydrateState(TODO_ID, timer)
    vi.setSystemTime(1_900_000_000_000)
    const second = hydrateState(TODO_ID, timer)
    vi.useRealTimers()

    expect(first.activeSessionId).toBe(second.activeSessionId)
    expect(first.sessionSequenceSeed).toBe(second.sessionSequenceSeed)
    expect(first.sessions[0]?.clientSessionId).toBe(second.sessions[0]?.clientSessionId)
  })

  it('keeps a legacy session signature stable across repeated sync checks', () => {
    const session = { sessionFocusSeconds: 600, breakSeconds: 60 }
    const timer = createLegacyStopwatch({ sessions: [session] })

    expect(getSessionSignature(TODO_ID, timer, session, 0)).toBe(
      getSessionSignature(TODO_ID, timer, session, 0),
    )
  })

  it('derives the same next focus id in independent runtimes', () => {
    const identity = createSessionIdentity()
    const timer = createLegacyStopwatch(identity)

    expect(advanceSessionIdentity(TODO_ID, timer)).toEqual(
      advanceSessionIdentity(TODO_ID, { ...timer, sessions: [] }),
    )
    expect(advanceSessionIdentity(TODO_ID, timer).activeSessionId).not.toBe(
      identity.activeSessionId,
    )
  })
})
