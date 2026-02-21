import { describe, expect, it, vi, beforeEach } from 'vitest'
import { initialSingleTimerState, useTimerStore } from './timerStore'

const settings = {
  flowMin: 1,
  breakMin: 1,
  longBreakMin: 2,
  cycleEvery: 2,
  autoStartBreak: false,
  autoStartSession: false,
}

const settingsAutoStart = {
  ...settings,
  autoStartBreak: true,
  autoStartSession: true,
}

beforeEach(() => {
  useTimerStore.setState({ timers: {}, pendingAutoSessions: {} })
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-01-09T00:00:00Z'))
  
  // localStorage와 sessionStorage 모킹
  const localStorageMock = {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
    key: vi.fn(),
    length: 0,
  }
  const sessionStorageMock = {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
    key: vi.fn(),
    length: 0,
  }
  Object.defineProperty(window, 'localStorage', { value: localStorageMock, writable: true })
  Object.defineProperty(window, 'sessionStorage', { value: sessionStorageMock, writable: true })
})

describe('timerStore', () => {
  it('startPomodoro and pauses/resumes with remaining time', () => {
    useTimerStore.getState().startPomodoro('todo-1', settings)
    const timer = useTimerStore.getState().getTimer('todo-1')

    expect(timer?.status).toBe('running')
    expect(timer?.mode).toBe('pomodoro')
    expect(timer?.endAt).toBe(
      new Date('2026-01-09T00:01:00Z').getTime(),
    )

    vi.setSystemTime(new Date('2026-01-09T00:00:20Z'))
    useTimerStore.getState().pause('todo-1')
    const pausedTimer = useTimerStore.getState().getTimer('todo-1')
    expect(pausedTimer?.status).toBe('paused')
    expect(pausedTimer?.remainingMs).toBeCloseTo(40_000, -2)

    vi.setSystemTime(new Date('2026-01-09T00:00:25Z'))
    useTimerStore.getState().resume('todo-1')
    const resumedTimer = useTimerStore.getState().getTimer('todo-1')
    expect(resumedTimer?.status).toBe('running')
    expect(resumedTimer?.remainingMs).toBeNull()
    expect(resumedTimer?.endAt).toBeCloseTo(
      new Date('2026-01-09T00:00:25Z').getTime() + 40_000,
      -2,
    )
  })

  it('startStopwatch and tracks elapsed time', () => {
    useTimerStore.getState().startStopwatch('todo-1')
    const timer = useTimerStore.getState().getTimer('todo-1')

    expect(timer?.status).toBe('running')
    expect(timer?.mode).toBe('stopwatch')
    expect(timer?.elapsedMs).toBe(0)

    vi.setSystemTime(new Date('2026-01-09T00:00:10Z'))
    useTimerStore.getState().tick()
    const afterTick = useTimerStore.getState().getTimer('todo-1')
    expect(afterTick?.elapsedMs).toBeCloseTo(10_000, -2)

    useTimerStore.getState().pause('todo-1')
    const paused = useTimerStore.getState().getTimer('todo-1')
    expect(paused?.status).toBe('paused')

    useTimerStore.getState().resume('todo-1')
    const resumed = useTimerStore.getState().getTimer('todo-1')
    expect(resumed?.status).toBe('running')
  })

  it('flow completion enters waiting state when autoStartBreak is false', () => {
    useTimerStore.setState({
      timers: {
        'todo-1': {
          ...initialSingleTimerState,
          mode: 'pomodoro',
          settingsSnapshot: settings,
          status: 'running',
          phase: 'flow',
          cycleCount: 1,
          endAt: Date.now() + 1000,
        },
      },
      pendingAutoSessions: {},
    })

    useTimerStore.getState().completePhase('todo-1')
    const timer = useTimerStore.getState().getTimer('todo-1')
    expect(timer?.phase).toBe('long')
    expect(timer?.status).toBe('waiting')
    expect(timer?.cycleCount).toBe(2)

    // resume from waiting starts the break
    useTimerStore.getState().resume('todo-1')
    const resumed = useTimerStore.getState().getTimer('todo-1')
    expect(resumed?.status).toBe('running')
  })

  it('flow completion auto-starts break when autoStartBreak is true', () => {
    useTimerStore.setState({
      timers: {
        'todo-1': {
          ...initialSingleTimerState,
          mode: 'pomodoro',
          settingsSnapshot: settingsAutoStart,
          status: 'running',
          phase: 'flow',
          cycleCount: 1,
          endAt: Date.now() + 1000,
        },
      },
      pendingAutoSessions: {},
    })

    useTimerStore.getState().completePhase('todo-1')
    const timer = useTimerStore.getState().getTimer('todo-1')
    expect(timer?.phase).toBe('long')
    expect(timer?.status).toBe('running')
    expect(timer?.cycleCount).toBe(2)
  })

  it('break completion enters waiting when autoStartSession is false', () => {
    useTimerStore.setState({
      timers: {
        'todo-1': {
          ...initialSingleTimerState,
          mode: 'pomodoro',
          settingsSnapshot: settings,
          status: 'running',
          phase: 'short',
          cycleCount: 1,
          endAt: Date.now() + 1000,
        },
      },
      pendingAutoSessions: {},
    })

    useTimerStore.getState().completePhase('todo-1')
    const timer = useTimerStore.getState().getTimer('todo-1')
    expect(timer?.phase).toBe('flow')
    expect(timer?.status).toBe('waiting')
  })

  it('break completion updates breakSeconds when elapsed meets minimum', () => {
    useTimerStore.setState({
      timers: {
        'todo-1': {
          ...initialSingleTimerState,
          mode: 'pomodoro',
          settingsSnapshot: settings,
          status: 'running',
          phase: 'short',
          cycleCount: 1,
          endAt: Date.now() - 1000,
          sessions: [{ sessionFocusSeconds: 60, breakSeconds: 0 }],
        },
      },
      pendingAutoSessions: {},
    })

    useTimerStore.getState().completePhase('todo-1')
    const timer = useTimerStore.getState().getTimer('todo-1')
    expect(timer?.sessions[0]).toEqual(expect.objectContaining({ sessionFocusSeconds: 60, breakSeconds: 60 }))
  })

  it('break completion updates pending auto queue for already-queued session', () => {
    const clientSessionId = '11111111-1111-4111-8111-111111111111'
    useTimerStore.setState({
      timers: {
        'todo-1': {
          ...initialSingleTimerState,
          mode: 'pomodoro',
          settingsSnapshot: settings,
          status: 'running',
          phase: 'short',
          cycleCount: 1,
          endAt: Date.now() - 1000,
          sessions: [{ sessionFocusSeconds: 60, breakSeconds: 0, clientSessionId }],
        },
      },
      pendingAutoSessions: {
        'todo-1': [{ sessionFocusSeconds: 60, breakSeconds: 0, clientSessionId }],
      },
    })

    useTimerStore.getState().completePhase('todo-1')

    const pending = useTimerStore.getState().pendingAutoSessions['todo-1']
    expect(pending).toHaveLength(1)
    expect(pending?.[0]).toEqual({
      sessionFocusSeconds: 60,
      breakSeconds: 60,
      clientSessionId,
    })
  })

  it('break completion re-queues session update when session was already acked', () => {
    const clientSessionId = '11111111-1111-4111-8111-111111111111'
    useTimerStore.setState({
      timers: {
        'todo-1': {
          ...initialSingleTimerState,
          mode: 'pomodoro',
          settingsSnapshot: settings,
          status: 'running',
          phase: 'short',
          cycleCount: 1,
          endAt: Date.now() - 1000,
          sessions: [{ sessionFocusSeconds: 60, breakSeconds: 0, clientSessionId }],
        },
      },
      pendingAutoSessions: {},
    })

    useTimerStore.getState().completePhase('todo-1')

    const pending = useTimerStore.getState().pendingAutoSessions['todo-1']
    expect(pending).toHaveLength(1)
    expect(pending?.[0]).toEqual({
      sessionFocusSeconds: 60,
      breakSeconds: 60,
      clientSessionId,
    })
  })

  it('skipToNext from flow records session when elapsed meets minimum', () => {
    useTimerStore.setState({
      timers: {
        'todo-1': {
          ...initialSingleTimerState,
          mode: 'pomodoro',
          settingsSnapshot: settings,
          status: 'running',
          phase: 'flow',
          cycleCount: 0,
          endAt: Date.now() - 1000,
          sessions: [],
        },
      },
      pendingAutoSessions: {},
    })

    const timer = useTimerStore.getState().getTimer('todo-1')
    expect(timer?.sessions.length).toBe(0)

    useTimerStore.getState().skipToNext('todo-1')
    const afterSkip = useTimerStore.getState().getTimer('todo-1')
    expect(afterSkip?.phase).toBe('short')
    expect(afterSkip?.status).toBe('running')
    expect(afterSkip?.cycleCount).toBe(1)
    expect(afterSkip?.sessions.length).toBe(1)
    expect(afterSkip?.sessions[0]).toEqual(expect.objectContaining({ sessionFocusSeconds: 60, breakSeconds: 0 }))
  })

  it('skipToNext from flow does not record session when elapsed is below minimum', () => {
    useTimerStore.setState({
      timers: {
        'todo-1': {
          ...initialSingleTimerState,
          mode: 'pomodoro',
          settingsSnapshot: settings,
          status: 'running',
          phase: 'flow',
          cycleCount: 0,
          endAt: Date.now() + 30_000,
          sessions: [],
        },
      },
      pendingAutoSessions: {},
    })

    useTimerStore.getState().skipToNext('todo-1')
    const afterSkip = useTimerStore.getState().getTimer('todo-1')
    expect(afterSkip?.sessions.length).toBe(0)
  })

  it('skipToNext from break transitions to flow phase', () => {
    useTimerStore.setState({
      timers: {
        'todo-1': {
          ...initialSingleTimerState,
          mode: 'pomodoro',
          settingsSnapshot: settings,
          status: 'running',
          phase: 'short',
          cycleCount: 1,
          endAt: Date.now() - 1000,
          sessions: [{ sessionFocusSeconds: 60, breakSeconds: 0 }], // 기존 세션 1개
        },
      },
      pendingAutoSessions: {},
    })

    const timer = useTimerStore.getState().getTimer('todo-1')
    expect(timer?.sessions.length).toBe(1)

    useTimerStore.getState().skipToNext('todo-1')
    const afterSkip = useTimerStore.getState().getTimer('todo-1')
    expect(afterSkip?.phase).toBe('flow')
    expect(afterSkip?.status).toBe('running')
    expect(afterSkip?.sessions.length).toBe(1)
    expect(afterSkip?.sessions[0]).toEqual(expect.objectContaining({ sessionFocusSeconds: 60, breakSeconds: 60 }))
  })

  it('skipToNext from break does not update breakSeconds when elapsed is below minimum', () => {
    useTimerStore.setState({
      timers: {
        'todo-1': {
          ...initialSingleTimerState,
          mode: 'pomodoro',
          settingsSnapshot: settings,
          status: 'running',
          phase: 'short',
          cycleCount: 1,
          endAt: Date.now() + 30_000,
          sessions: [{ sessionFocusSeconds: 60, breakSeconds: 0 }],
        },
      },
      pendingAutoSessions: {},
    })

    useTimerStore.getState().skipToNext('todo-1')
    const afterSkip = useTimerStore.getState().getTimer('todo-1')
    expect(afterSkip?.sessions[0]).toEqual(expect.objectContaining({ sessionFocusSeconds: 60, breakSeconds: 0 }))
  })

  it('queues auto-completed pomodoro sessions per todo', () => {
    useTimerStore.setState({
      timers: {
        'todo-1': {
          ...initialSingleTimerState,
          mode: 'pomodoro',
          settingsSnapshot: settings,
          status: 'running',
          phase: 'flow',
          cycleCount: 0,
          endAt: Date.now() - 1000,
          sessions: [],
        },
      },
      pendingAutoSessions: {},
    })

    useTimerStore.getState().completePhase('todo-1')
    const pending = useTimerStore.getState().pendingAutoSessions['todo-1']
    expect(pending).toHaveLength(1)
    expect(pending?.[0]).toEqual(expect.objectContaining({
      sessionFocusSeconds: 60,
      breakSeconds: 0,
    }))
    expect(pending?.[0]?.clientSessionId).toEqual(expect.any(String))
  })

  it('ackAutoSession removes only one queued entry', () => {
    useTimerStore.setState({
      timers: {},
      pendingAutoSessions: {
        'todo-1': [
          { sessionFocusSeconds: 60, breakSeconds: 0, clientSessionId: '11111111-1111-4111-8111-111111111111' },
          { sessionFocusSeconds: 45, breakSeconds: 0, clientSessionId: '22222222-2222-4222-8222-222222222222' },
        ],
      },
    })

    useTimerStore.getState().ackAutoSession('todo-1')
    expect(useTimerStore.getState().pendingAutoSessions['todo-1']).toEqual([
      { sessionFocusSeconds: 45, breakSeconds: 0, clientSessionId: '22222222-2222-4222-8222-222222222222' },
    ])

    useTimerStore.getState().ackAutoSession('todo-1')
    expect(useTimerStore.getState().pendingAutoSessions['todo-1']).toBeUndefined()
  })

  it('does not add session on extra break completion and confirms once on resumeFocus', () => {
    const breakTargetMs = 10_000
    const start = new Date('2026-01-09T00:00:00Z').getTime()

    useTimerStore.setState({
      timers: {
        'todo-1': {
          ...initialSingleTimerState,
          mode: 'stopwatch',
          settingsSnapshot: settings,
          status: 'running',
          phase: 'flow',
          flexiblePhase: 'break_suggested',
          focusElapsedMs: 72_000,
          initialFocusMs: 0,
          breakElapsedMs: 9_500,
          breakTargetMs,
          breakCompleted: false,
          breakStartedAt: start,
          sessions: [],
        },
      },
      pendingAutoSessions: {},
    })

    vi.setSystemTime(new Date(start + 1_000))
    useTimerStore.getState().tick()

    const afterBreakComplete = useTimerStore.getState().getTimer('todo-1')
    expect(afterBreakComplete?.breakCompleted).toBe(true)
    expect(afterBreakComplete?.flexiblePhase).toBe('break_suggested')
    expect(afterBreakComplete?.sessions).toHaveLength(0)

    vi.setSystemTime(new Date(start + 3_000))
    useTimerStore.getState().tick()
    const afterExtraBreak = useTimerStore.getState().getTimer('todo-1')
    expect(afterExtraBreak?.sessions).toHaveLength(0)

    useTimerStore.getState().resumeFocus('todo-1')
    const afterResumeFocus = useTimerStore.getState().getTimer('todo-1')

    expect(afterResumeFocus?.sessions).toHaveLength(1)
    expect(afterResumeFocus?.sessions[0]?.sessionFocusSeconds).toBe(72)
    expect(afterResumeFocus?.flexiblePhase).toBe('focus')
  })

  it('records session at focus end and finalizes breakSeconds on resumeFocus', () => {
    const start = new Date('2026-01-09T10:00:00Z').getTime()

    useTimerStore.setState({
      timers: {
        'todo-1': {
          ...initialSingleTimerState,
          mode: 'stopwatch',
          settingsSnapshot: settings,
          status: 'running',
          phase: 'flow',
          flexiblePhase: 'focus',
          focusElapsedMs: 72_000,
          initialFocusMs: 0,
          focusStartedAt: start,
          breakStartedAt: null,
          sessions: [],
        },
      },
      pendingAutoSessions: {},
    })

    vi.setSystemTime(new Date(start))
    useTimerStore.getState().startBreak('todo-1', 60_000)

    const afterStartBreak = useTimerStore.getState().getTimer('todo-1')
    expect(afterStartBreak?.flexiblePhase).toBe('break_suggested')
    expect(afterStartBreak?.sessions).toHaveLength(1)
    expect(afterStartBreak?.sessions[0]?.sessionFocusSeconds).toBe(72)
    expect(afterStartBreak?.sessions[0]?.breakSeconds).toBe(0)
    expect(afterStartBreak?.breakSessionPendingUpdate).toBe(true)

    vi.setSystemTime(new Date(start + 30_000))
    useTimerStore.getState().resumeFocus('todo-1')

    const afterResume = useTimerStore.getState().getTimer('todo-1')
    expect(afterResume?.sessions).toHaveLength(1)
    expect(afterResume?.sessions[0]?.breakSeconds).toBe(30)
    expect(afterResume?.breakSessionPendingUpdate).toBe(false)
    expect(afterResume?.flexiblePhase).toBe('focus')
  })
})
