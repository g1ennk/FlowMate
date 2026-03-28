import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SingleTimerState } from './timerTypes'
import { useTimerStore } from './timerStore'

vi.mock('../../lib/sound', () => ({
  playNotificationSound: vi.fn(),
}))

const TODO_ID = 'todo-1'
const EXISTING_SESSION_ID = '11111111-1111-4111-8111-111111111111'

const settings = {
  flowMin: 10,
  breakMin: 1,
  longBreakMin: 5,
  cycleEvery: 4,
  autoStartBreak: true,
  autoStartSession: false,
}

function createPomodoroTimer(overrides: Partial<SingleTimerState>): SingleTimerState {
  return {
    mode: 'pomodoro',
    settingsSnapshot: settings,
    phase: 'short',
    status: 'running',
    endAt: null,
    remainingMs: null,
    elapsedMs: 0,
    initialFocusMs: 0,
    startedAt: null,
    cycleCount: 1,
    flexiblePhase: null,
    focusElapsedMs: 0,
    breakElapsedMs: 0,
    breakTargetMs: null,
    breakCompleted: false,
    focusStartedAt: null,
    breakStartedAt: null,
    breakSessionPendingUpdate: false,
    sessions: [
      {
        sessionFocusSeconds: 600,
        breakSeconds: 0,
        clientSessionId: EXISTING_SESSION_ID,
      },
    ],
    ...overrides,
  }
}

function setTimer(timer: SingleTimerState) {
  useTimerStore.setState({
    timers: { [TODO_ID]: timer },
    pendingAutoSessions: {},
  })
}

describe('useTimerStore pomodoro elapsed boundary handling', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-06T09:00:00.000Z'))
    useTimerStore.getState().clearAll()
  })

  afterEach(() => {
    useTimerStore.getState().clearAll()
    vi.useRealTimers()
  })

  it('records a 60 second break when the countdown auto-completes', () => {
    setTimer(
      createPomodoroTimer({
        phase: 'short',
        endAt: Date.now() - 1,
        remainingMs: 80,
      }),
    )

    useTimerStore.getState().tick()

    const timer = useTimerStore.getState().timers[TODO_ID]
    expect(timer.phase).toBe('flow')
    expect(timer.status).toBe('waiting')
    expect(timer.sessions[0]).toMatchObject({
      sessionFocusSeconds: 600,
      breakSeconds: 60,
      clientSessionId: EXISTING_SESSION_ID,
    })
    expect(useTimerStore.getState().pendingAutoSessions[TODO_ID]).toEqual([
      {
        sessionFocusSeconds: 600,
        breakSeconds: 60,
        clientSessionId: EXISTING_SESSION_ID,
      },
    ])
  })

  it('does not record a 59 second break when returning to flow manually', () => {
    setTimer(
      createPomodoroTimer({
        phase: 'short',
        endAt: Date.now() + 1_000,
        remainingMs: 0,
      }),
    )

    useTimerStore.getState().skipToNext(TODO_ID)

    const timer = useTimerStore.getState().timers[TODO_ID]
    expect(timer.phase).toBe('flow')
    expect(timer.sessions[0]).toMatchObject({
      sessionFocusSeconds: 600,
      breakSeconds: 0,
      clientSessionId: EXISTING_SESSION_ID,
    })
    expect(useTimerStore.getState().pendingAutoSessions[TODO_ID]).toBeUndefined()
  })

  it('records a 60 second break when returning to flow manually at the boundary', () => {
    setTimer(
      createPomodoroTimer({
        phase: 'short',
        endAt: Date.now(),
        remainingMs: 75,
      }),
    )

    useTimerStore.getState().skipToNext(TODO_ID)

    const timer = useTimerStore.getState().timers[TODO_ID]
    expect(timer.phase).toBe('flow')
    expect(timer.sessions[0]).toMatchObject({
      sessionFocusSeconds: 600,
      breakSeconds: 60,
      clientSessionId: EXISTING_SESSION_ID,
    })
    expect(useTimerStore.getState().pendingAutoSessions[TODO_ID]).toEqual([
      {
        sessionFocusSeconds: 600,
        breakSeconds: 60,
        clientSessionId: EXISTING_SESSION_ID,
      },
    ])
  })

  it('records a 61 second break when returning to flow manually after the boundary', () => {
    setTimer(
      createPomodoroTimer({
        phase: 'short',
        endAt: Date.now() - 1_000,
        remainingMs: 75,
      }),
    )

    useTimerStore.getState().skipToNext(TODO_ID)

    const timer = useTimerStore.getState().timers[TODO_ID]
    expect(timer.phase).toBe('flow')
    expect(timer.sessions[0]).toMatchObject({
      sessionFocusSeconds: 600,
      breakSeconds: 61,
      clientSessionId: EXISTING_SESSION_ID,
    })
    expect(useTimerStore.getState().pendingAutoSessions[TODO_ID]).toEqual([
      {
        sessionFocusSeconds: 600,
        breakSeconds: 61,
        clientSessionId: EXISTING_SESSION_ID,
      },
    ])
  })

  it('records a 60 second flow when moving to break manually with stale remaining time', () => {
    setTimer(
      createPomodoroTimer({
        phase: 'flow',
        endAt: Date.now() + 540_000,
        remainingMs: 600_000,
        cycleCount: 0,
        sessions: [],
      }),
    )

    useTimerStore.getState().skipToNext(TODO_ID)

    const timer = useTimerStore.getState().timers[TODO_ID]
    expect(timer.phase).toBe('short')
    expect(timer.status).toBe('running')
    expect(timer.sessions).toHaveLength(1)
    expect(timer.sessions[0]).toMatchObject({
      sessionFocusSeconds: 60,
      breakSeconds: 0,
    })
    expect(timer.sessions[0].clientSessionId).toEqual(expect.any(String))
    expect(useTimerStore.getState().pendingAutoSessions[TODO_ID]).toHaveLength(1)
    expect(useTimerStore.getState().pendingAutoSessions[TODO_ID]?.[0]).toMatchObject({
      sessionFocusSeconds: 60,
      breakSeconds: 0,
      clientSessionId: timer.sessions[0].clientSessionId,
    })
  })
})

describe('useTimerStore applyRemoteState / applyRemoteReset', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-06T09:00:00.000Z'))
    useTimerStore.getState().clearAll()
  })

  afterEach(() => {
    useTimerStore.getState().clearAll()
    vi.useRealTimers()
  })

  const remoteTimer: SingleTimerState = {
    mode: 'pomodoro',
    phase: 'flow',
    status: 'running',
    endAt: Date.now() + 600_000,
    remainingMs: 600_000,
    elapsedMs: 0,
    initialFocusMs: 0,
    startedAt: Date.now(),
    cycleCount: 1,
    settingsSnapshot: null,
    flexiblePhase: null,
    focusElapsedMs: 0,
    breakElapsedMs: 0,
    breakTargetMs: null,
    breakCompleted: false,
    focusStartedAt: null,
    breakStartedAt: null,
    breakSessionPendingUpdate: false,
    sessions: [],
  }

  it('applyRemoteState with serverTime > last applies the state', () => {
    useTimerStore.getState().applyRemoteState(TODO_ID, remoteTimer, 100)

    expect(useTimerStore.getState().timers[TODO_ID]).toBeDefined()
    expect(useTimerStore.getState().timers[TODO_ID].status).toBe('running')
  })

  it('applyRemoteState with same serverTime applies the state', () => {
    useTimerStore.getState().applyRemoteState(TODO_ID, remoteTimer, 100)

    const updated: SingleTimerState = { ...remoteTimer, status: 'paused', endAt: null }
    useTimerStore.getState().applyRemoteState(TODO_ID, updated, 100)

    expect(useTimerStore.getState().timers[TODO_ID].status).toBe('paused')
  })

  it('applyRemoteState with serverTime < last is dropped', () => {
    useTimerStore.getState().applyRemoteState(TODO_ID, remoteTimer, 200)

    const stale: SingleTimerState = { ...remoteTimer, status: 'paused', endAt: null }
    useTimerStore.getState().applyRemoteState(TODO_ID, stale, 100)

    expect(useTimerStore.getState().timers[TODO_ID].status).toBe('running')
  })

  it('applyRemoteReset with serverTime > last removes the timer', () => {
    useTimerStore.getState().applyRemoteState(TODO_ID, remoteTimer, 100)
    expect(useTimerStore.getState().timers[TODO_ID]).toBeDefined()

    useTimerStore.getState().applyRemoteReset(TODO_ID, 200)
    expect(useTimerStore.getState().timers[TODO_ID]).toBeUndefined()
  })

  it('applyRemoteReset with same serverTime removes the timer', () => {
    useTimerStore.getState().applyRemoteState(TODO_ID, remoteTimer, 100)
    expect(useTimerStore.getState().timers[TODO_ID]).toBeDefined()

    useTimerStore.getState().applyRemoteReset(TODO_ID, 100)
    expect(useTimerStore.getState().timers[TODO_ID]).toBeUndefined()
  })
})
