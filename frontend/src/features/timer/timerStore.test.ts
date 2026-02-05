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
  useTimerStore.setState({ timers: {}, autoCompletedTodos: new Set() })
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
      autoCompletedTodos: new Set(),
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
      autoCompletedTodos: new Set(),
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
      autoCompletedTodos: new Set(),
    })

    useTimerStore.getState().completePhase('todo-1')
    const timer = useTimerStore.getState().getTimer('todo-1')
    expect(timer?.phase).toBe('flow')
    expect(timer?.status).toBe('waiting')
  })

  it('skipToNext from flow transitions to break phase', () => {
    useTimerStore.setState({
      timers: {
        'todo-1': {
          ...initialSingleTimerState,
          mode: 'pomodoro',
          settingsSnapshot: settings,
          status: 'running',
          phase: 'flow',
          cycleCount: 0,
          endAt: Date.now() + 1000,
          sessions: [],
        },
      },
      autoCompletedTodos: new Set(),
    })

    const timer = useTimerStore.getState().getTimer('todo-1')
    expect(timer?.sessions.length).toBe(0)

    useTimerStore.getState().skipToNext('todo-1')
    const afterSkip = useTimerStore.getState().getTimer('todo-1')
    expect(afterSkip?.phase).toBe('short')
    expect(afterSkip?.status).toBe('running')
    expect(afterSkip?.cycleCount).toBe(1)
    // 스킵 시 sessions에 기록되지 않음
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
          endAt: Date.now() + 1000,
          sessions: [{ sessionFocusSeconds: 60, breakSeconds: 0 }], // 기존 세션 1개
        },
      },
      autoCompletedTodos: new Set(),
    })

    const timer = useTimerStore.getState().getTimer('todo-1')
    expect(timer?.sessions.length).toBe(1)

    useTimerStore.getState().skipToNext('todo-1')
    const afterSkip = useTimerStore.getState().getTimer('todo-1')
    expect(afterSkip?.phase).toBe('flow')
    expect(afterSkip?.status).toBe('running')
    // 스킵 시 sessions가 변경되지 않음 (기존 세션 유지)
    expect(afterSkip?.sessions.length).toBe(1)
    expect(afterSkip?.sessions[0]).toEqual({ sessionFocusSeconds: 60, breakSeconds: 0 })
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
      autoCompletedTodos: new Set(),
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
})
