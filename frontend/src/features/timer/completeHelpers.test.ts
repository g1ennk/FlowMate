import { describe, expect, it, vi } from 'vitest'
import type { PomodoroSettings } from '../../api/types'
import type { SingleTimerState } from './timerTypes'
import { completeTaskFromTimer } from './completeHelpers'

const settings: PomodoroSettings = {
  flowMin: 25,
  breakMin: 5,
  longBreakMin: 15,
  cycleEvery: 4,
  autoStartBreak: false,
  autoStartSession: false,
}

function createBaseTimer(): SingleTimerState {
  return {
    mode: 'stopwatch',
    phase: 'flow',
    status: 'paused',
    endAt: null,
    remainingMs: null,
    elapsedMs: 0,
    initialFocusMs: 0,
    startedAt: null,
    cycleCount: 0,
    settingsSnapshot: settings,
    flexiblePhase: 'focus',
    focusElapsedMs: 0,
    breakElapsedMs: 0,
    breakTargetMs: null,
    breakCompleted: false,
    focusStartedAt: null,
    breakStartedAt: null,
    breakSessionPendingUpdate: false,
    sessions: [],
  }
}

function createStopwatchTimer(overrides: Partial<SingleTimerState> = {}): SingleTimerState {
  return {
    ...createBaseTimer(),
    mode: 'stopwatch',
    flexiblePhase: 'focus',
    focusElapsedMs: 120_000,
    ...overrides,
  }
}

function createPomodoroTimer(overrides: Partial<SingleTimerState> = {}): SingleTimerState {
  return {
    ...createBaseTimer(),
    mode: 'pomodoro',
    phase: 'flow',
    status: 'paused',
    remainingMs: settings.flowMin * 60_000 - 120_000,
    flexiblePhase: null,
    focusElapsedMs: 0,
    ...overrides,
  }
}

describe('completeTaskFromTimer', () => {
  it('resets stopwatch timer after successfully completing a task', async () => {
    const updateSessions = vi.fn()
    const syncSessionsImmediately = vi.fn().mockResolvedValue(undefined)
    const updateTodo = vi.fn().mockResolvedValue(undefined)
    const reset = vi.fn()

    await completeTaskFromTimer({
      todoId: 'todo-1',
      timer: createStopwatchTimer(),
      settings,
      pause: vi.fn(),
      reset,
      getTimer: vi.fn(),
      updateSessions,
      updateTodo,
      syncSessionsImmediately,
      applySessionAggregateDelta: vi.fn(),
    })

    expect(updateSessions).toHaveBeenCalledWith(
      'todo-1',
      expect.arrayContaining([
        expect.objectContaining({
          sessionFocusSeconds: 120,
          breakSeconds: 0,
          clientSessionId: expect.any(String),
        }),
      ]),
    )
    expect(syncSessionsImmediately).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          sessionFocusSeconds: 120,
          breakSeconds: 0,
        }),
      ]),
    )
    expect(updateTodo).toHaveBeenCalledWith({
      id: 'todo-1',
      patch: {
        isDone: true,
        timerMode: 'stopwatch',
      },
    })
    expect(reset).toHaveBeenCalledWith('todo-1')
    expect(syncSessionsImmediately.mock.invocationCallOrder[0]).toBeLessThan(
      updateTodo.mock.invocationCallOrder[0],
    )
    expect(updateTodo.mock.invocationCallOrder[0]).toBeLessThan(reset.mock.invocationCallOrder[0])
  })

  it('resets pomodoro timer after successfully completing a task', async () => {
    const updateSessions = vi.fn()
    const syncSessionsImmediately = vi.fn().mockResolvedValue(undefined)
    const updateTodo = vi.fn().mockResolvedValue(undefined)
    const reset = vi.fn()

    await completeTaskFromTimer({
      todoId: 'todo-2',
      timer: createPomodoroTimer(),
      settings,
      pause: vi.fn(),
      reset,
      getTimer: vi.fn(),
      updateSessions,
      updateTodo,
      syncSessionsImmediately,
      applySessionAggregateDelta: vi.fn(),
    })

    expect(updateSessions).toHaveBeenCalledWith(
      'todo-2',
      expect.arrayContaining([
        expect.objectContaining({
          sessionFocusSeconds: 120,
          breakSeconds: 0,
          clientSessionId: expect.any(String),
        }),
      ]),
    )
    expect(syncSessionsImmediately).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          sessionFocusSeconds: 120,
          breakSeconds: 0,
        }),
      ]),
    )
    expect(updateTodo).toHaveBeenCalledWith({
      id: 'todo-2',
      patch: {
        isDone: true,
        timerMode: 'pomodoro',
      },
    })
    expect(reset).toHaveBeenCalledWith('todo-2')
    expect(syncSessionsImmediately.mock.invocationCallOrder[0]).toBeLessThan(
      updateTodo.mock.invocationCallOrder[0],
    )
    expect(updateTodo.mock.invocationCallOrder[0]).toBeLessThan(reset.mock.invocationCallOrder[0])
  })

  it.each([
    ['stopwatch', createStopwatchTimer()],
    ['pomodoro', createPomodoroTimer()],
  ] as const)(
    'keeps the %s timer and session state when immediate session sync fails',
    async (_mode, timer) => {
      const syncError = new Error('session sync failed')
      const updateSessions = vi.fn()
      const applySessionAggregateDelta = vi.fn()
      const updateTodo = vi.fn().mockResolvedValue(undefined)
      const reset = vi.fn()

      await expect(
        completeTaskFromTimer({
          todoId: 'todo-failure',
          timer,
          settings,
          pause: vi.fn(),
          reset,
          getTimer: vi.fn(),
          updateSessions,
          updateTodo,
          syncSessionsImmediately: vi.fn().mockRejectedValue(syncError),
          applySessionAggregateDelta,
        }),
      ).rejects.toBe(syncError)

      expect(updateSessions).not.toHaveBeenCalled()
      expect(applySessionAggregateDelta).not.toHaveBeenCalled()
      expect(updateTodo).not.toHaveBeenCalled()
      expect(reset).not.toHaveBeenCalled()
    },
  )

  it('applies the aggregate delta once after a failed sync is retried successfully', async () => {
    const timer = createStopwatchTimer()
    const syncError = new Error('session sync failed')
    const syncSessionsImmediately = vi
      .fn()
      .mockRejectedValueOnce(syncError)
      .mockResolvedValueOnce(undefined)
    const updateSessions = vi.fn()
    const applySessionAggregateDelta = vi.fn()
    const updateTodo = vi.fn().mockResolvedValue(undefined)
    const reset = vi.fn()
    const deps = {
      todoId: 'todo-retry',
      timer,
      settings,
      pause: vi.fn(),
      reset,
      getTimer: vi.fn(),
      updateSessions,
      updateTodo,
      syncSessionsImmediately,
      applySessionAggregateDelta,
    }

    await expect(completeTaskFromTimer(deps)).rejects.toBe(syncError)
    await completeTaskFromTimer(deps)

    expect(syncSessionsImmediately).toHaveBeenCalledTimes(2)
    expect(applySessionAggregateDelta).toHaveBeenCalledTimes(1)
    expect(applySessionAggregateDelta).toHaveBeenCalledWith({
      focusDeltaSeconds: 120,
      sessionCountDelta: 1,
    })
    expect(updateTodo).toHaveBeenCalledTimes(1)
    expect(reset).toHaveBeenCalledTimes(1)
  })
})
