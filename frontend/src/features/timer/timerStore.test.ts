import { describe, expect, it, vi, beforeEach } from 'vitest'
import { initialTimerState, useTimerStore } from './timerStore'

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
  useTimerStore.setState(initialTimerState)
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-01-09T00:00:00Z'))
})

describe('timerStore', () => {
  it('startPomodoro and pauses/resumes with remaining time', () => {
    useTimerStore.getState().startPomodoro('todo-1', settings)

    expect(useTimerStore.getState().status).toBe('running')
    expect(useTimerStore.getState().mode).toBe('pomodoro')
    expect(useTimerStore.getState().endAt).toBe(
      new Date('2026-01-09T00:01:00Z').getTime(),
    )

    vi.setSystemTime(new Date('2026-01-09T00:00:20Z'))
    useTimerStore.getState().pause()
    expect(useTimerStore.getState().status).toBe('paused')
    expect(useTimerStore.getState().remainingMs).toBeCloseTo(40_000, -2)

    vi.setSystemTime(new Date('2026-01-09T00:00:25Z'))
    useTimerStore.getState().resume()
    expect(useTimerStore.getState().status).toBe('running')
    expect(useTimerStore.getState().remainingMs).toBeNull()
    expect(useTimerStore.getState().endAt).toBeCloseTo(
      new Date('2026-01-09T00:00:25Z').getTime() + 40_000,
      -2,
    )
  })

  it('startStopwatch and tracks elapsed time', () => {
    useTimerStore.getState().startStopwatch('todo-1')

    expect(useTimerStore.getState().status).toBe('running')
    expect(useTimerStore.getState().mode).toBe('stopwatch')
    expect(useTimerStore.getState().elapsedMs).toBe(0)

    vi.setSystemTime(new Date('2026-01-09T00:00:10Z'))
    useTimerStore.getState().tick()
    expect(useTimerStore.getState().elapsedMs).toBeCloseTo(10_000, -2)

    useTimerStore.getState().pause()
    expect(useTimerStore.getState().status).toBe('paused')

    useTimerStore.getState().resume()
    expect(useTimerStore.getState().status).toBe('running')
  })

  it('flow completion enters waiting state when autoStartBreak is false', () => {
    useTimerStore.setState({
      ...initialTimerState,
      todoId: 'todo-1',
      mode: 'pomodoro',
      settingsSnapshot: settings,
      status: 'running',
      phase: 'flow',
      cycleCount: 1,
      endAt: Date.now() + 1000,
    })

    useTimerStore.getState().completePhase()
    expect(useTimerStore.getState().phase).toBe('long')
    expect(useTimerStore.getState().status).toBe('waiting')
    expect(useTimerStore.getState().cycleCount).toBe(2)

    // resume from waiting starts the break
    useTimerStore.getState().resume()
    expect(useTimerStore.getState().status).toBe('running')
  })

  it('flow completion auto-starts break when autoStartBreak is true', () => {
    useTimerStore.setState({
      ...initialTimerState,
      todoId: 'todo-1',
      mode: 'pomodoro',
      settingsSnapshot: settingsAutoStart,
      status: 'running',
      phase: 'flow',
      cycleCount: 1,
      endAt: Date.now() + 1000,
    })

    useTimerStore.getState().completePhase()
    expect(useTimerStore.getState().phase).toBe('long')
    expect(useTimerStore.getState().status).toBe('running')
    expect(useTimerStore.getState().cycleCount).toBe(2)
  })

  it('break completion enters waiting when autoStartSession is false', () => {
    useTimerStore.setState({
      ...initialTimerState,
      todoId: 'todo-1',
      mode: 'pomodoro',
      settingsSnapshot: settings,
      status: 'running',
      phase: 'short',
      cycleCount: 1,
      endAt: Date.now() + 1000,
    })

    useTimerStore.getState().completePhase()
    expect(useTimerStore.getState().phase).toBe('flow')
    expect(useTimerStore.getState().status).toBe('waiting')
  })

  it('skipToBreak transitions to break phase', () => {
    useTimerStore.setState({
      ...initialTimerState,
      todoId: 'todo-1',
      mode: 'pomodoro',
      settingsSnapshot: settings,
      status: 'running',
      phase: 'flow',
      cycleCount: 0,
      endAt: Date.now() + 1000,
    })

    useTimerStore.getState().skipToBreak()
    expect(useTimerStore.getState().phase).toBe('short')
    expect(useTimerStore.getState().status).toBe('running')
    expect(useTimerStore.getState().cycleCount).toBe(1)
  })

  it('skipToFlow transitions to flow phase', () => {
    useTimerStore.setState({
      ...initialTimerState,
      todoId: 'todo-1',
      mode: 'pomodoro',
      settingsSnapshot: settings,
      status: 'running',
      phase: 'short',
      cycleCount: 1,
      endAt: Date.now() + 1000,
    })

    useTimerStore.getState().skipToFlow()
    expect(useTimerStore.getState().phase).toBe('flow')
    expect(useTimerStore.getState().status).toBe('running')
  })
})
