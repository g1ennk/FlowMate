import { describe, expect, it, vi } from 'vitest'
import { completeTaskFromTimer } from './completeHelpers'
import { initialSingleTimerState } from './timerStore'

const baseSettings = {
  flowMin: 25,
  breakMin: 5,
  longBreakMin: 15,
  cycleEvery: 4,
  autoStartBreak: false,
  autoStartSession: false,
}

describe('completeTaskFromTimer (pomodoro)', () => {
  it('does not record flow when elapsed is below minimum', async () => {
    const updateSessions = vi.fn()
    const createSession = vi.fn()
    const updateTodo = vi.fn().mockResolvedValue(undefined)

    await completeTaskFromTimer({
      todoId: 'todo-1',
      timer: {
        ...initialSingleTimerState,
        mode: 'pomodoro',
        status: 'paused',
        phase: 'flow',
        settingsSnapshot: baseSettings,
        remainingMs: 24 * 60 * 1000 + 30_000,
      },
      settings: baseSettings,
      pause: vi.fn(),
      getTimer: vi.fn(),
      updateSessions,
      createSession,
      updateTodo,
    })

    expect(updateSessions).not.toHaveBeenCalled()
    expect(createSession).not.toHaveBeenCalled()
  })

  it('records flow when elapsed meets minimum', async () => {
    const updateSessions = vi.fn()
    const createSession = vi.fn().mockResolvedValue(undefined)
    const updateTodo = vi.fn().mockResolvedValue(undefined)

    await completeTaskFromTimer({
      todoId: 'todo-1',
      timer: {
        ...initialSingleTimerState,
        mode: 'pomodoro',
        status: 'paused',
        phase: 'flow',
        settingsSnapshot: baseSettings,
        remainingMs: 24 * 60 * 1000,
      },
      settings: baseSettings,
      pause: vi.fn(),
      getTimer: vi.fn(),
      updateSessions,
      createSession,
      updateTodo,
    })

    expect(updateSessions).toHaveBeenCalledTimes(1)
    expect(createSession).toHaveBeenCalledTimes(1)
  })
})
