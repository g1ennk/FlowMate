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
  it.each([
    ['stopwatch', createStopwatchTimer({ focusElapsedMs: 4_522_000 })],
    ['pomodoro', createPomodoroTimer()],
  ] as const)('uses the same session id when two writers complete the same %s snapshot', async (_mode, timer) => {
    const capturedIds: string[] = []
    const complete = () => completeTaskFromTimer({
      todoId: 'todo-multi-writer',
      timer: { ...timer, sessions: [...timer.sessions] },
      settings,
      pause: vi.fn(),
      reset: vi.fn(),
      getTimer: vi.fn(),
      updateTodo: vi.fn().mockResolvedValue(undefined),
      syncSessionsImmediately: vi.fn(async (sessions) => {
        capturedIds.push(sessions.at(-1)?.clientSessionId ?? '')
      }),
    })

    await Promise.all([complete(), complete()])

    expect(capturedIds).toHaveLength(2)
    expect(capturedIds[0]).toBe(capturedIds[1])
  })

  it('uses the same deterministic id when two writers seal a legacy break session', async () => {
    const timer = createStopwatchTimer({
      flexiblePhase: 'break_free',
      focusElapsedMs: 120_000,
      initialFocusMs: 120_000,
      breakElapsedMs: 60_000,
      breakSessionPendingUpdate: true,
      sessions: [{ sessionFocusSeconds: 120, breakSeconds: 0 }],
    })
    const capturedIds: string[] = []
    const complete = () => completeTaskFromTimer({
      todoId: 'todo-legacy-break',
      timer: { ...timer, sessions: timer.sessions.map((session) => ({ ...session })) },
      settings,
      pause: vi.fn(),
      reset: vi.fn(),
      getTimer: vi.fn(),
      updateTodo: vi.fn().mockResolvedValue(undefined),
      syncSessionsImmediately: vi.fn(async (sessions) => {
        capturedIds.push(sessions[0].clientSessionId ?? '')
      }),
    })

    await Promise.all([complete(), complete()])

    expect(capturedIds[0]).toBe(capturedIds[1])
    expect(capturedIds[0]).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('resets stopwatch timer after successfully completing a task', async () => {
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
      updateTodo,
      syncSessionsImmediately,
    })

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
      updateTodo,
      syncSessionsImmediately,
    })

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
          updateTodo,
          syncSessionsImmediately: vi.fn().mockRejectedValue(syncError),
        }),
      ).rejects.toBe(syncError)

      expect(updateTodo).not.toHaveBeenCalled()
      expect(reset).not.toHaveBeenCalled()
    },
  )

  it('updates the todo once after a failed sync is retried successfully', async () => {
    const timer = createStopwatchTimer()
    const syncError = new Error('session sync failed')
    const syncSessionsImmediately = vi
      .fn()
      .mockRejectedValueOnce(syncError)
      .mockResolvedValueOnce(undefined)
    const updateTodo = vi.fn().mockResolvedValue(undefined)
    const reset = vi.fn()
    const deps = {
      todoId: 'todo-retry',
      timer,
      settings,
      pause: vi.fn(),
      reset,
      getTimer: vi.fn(),
      updateTodo,
      syncSessionsImmediately,
    }

    await expect(completeTaskFromTimer(deps)).rejects.toBe(syncError)
    await completeTaskFromTimer(deps)

    expect(syncSessionsImmediately).toHaveBeenCalledTimes(2)
    expect(updateTodo).toHaveBeenCalledTimes(1)
    expect(reset).toHaveBeenCalledTimes(1)
  })
})
