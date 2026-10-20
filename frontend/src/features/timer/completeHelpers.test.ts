import { describe, expect, it, vi } from 'vitest'
import type { PomodoroSettings } from '../../api/types'
import type { SingleTimerState } from './timerTypes'
import { completeTaskFromTimer, postSessions } from './completeHelpers'

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

  // 휴식 단계에서 완료해도, 집중이 끝날 때 백그라운드 저장이 실패한 기록을 완료 전에 다시 보낸다(멱등 id 그대로).
  // 예전에는 휴식 단계면 아무것도 보내지 않아서 저장 실패한 집중 기록이 0분으로 완료됐다
  it('re-sends the recorded focus sessions before completing a pomodoro in its break phase', async () => {
    const recorded = { sessionFocusSeconds: 1500, breakSeconds: 0, clientSessionId: '11111111-1111-4111-8111-111111111111' }
    const syncSessionsImmediately = vi.fn().mockResolvedValue(undefined)
    const updateTodo = vi.fn().mockResolvedValue(undefined)
    const reset = vi.fn()

    await completeTaskFromTimer({
      todoId: 'todo-break',
      timer: createPomodoroTimer({ phase: 'short', remainingMs: 4 * 60_000, sessions: [recorded] }),
      settings,
      pause: vi.fn(),
      reset,
      getTimer: vi.fn(),
      updateTodo,
      syncSessionsImmediately,
    })

    expect(syncSessionsImmediately).toHaveBeenCalledWith([recorded])
    expect(syncSessionsImmediately.mock.invocationCallOrder[0]).toBeLessThan(updateTodo.mock.invocationCallOrder[0])
    expect(reset).toHaveBeenCalledWith('todo-break')
  })

  it('completes a pomodoro in its break phase without sending anything when nothing was recorded', async () => {
    const syncSessionsImmediately = vi.fn().mockResolvedValue(undefined)
    const updateTodo = vi.fn().mockResolvedValue(undefined)

    await completeTaskFromTimer({
      todoId: 'todo-break-empty',
      timer: createPomodoroTimer({ phase: 'long', remainingMs: 10 * 60_000, sessions: [] }),
      settings,
      pause: vi.fn(),
      reset: vi.fn(),
      getTimer: vi.fn(),
      updateTodo,
      syncSessionsImmediately,
    })

    expect(syncSessionsImmediately).not.toHaveBeenCalled()
    expect(updateTodo).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['stopwatch', createStopwatchTimer()],
    ['pomodoro', createPomodoroTimer()],
    [
      'pomodoro (break phase)',
      createPomodoroTimer({
        phase: 'short',
        remainingMs: 4 * 60_000,
        sessions: [{ sessionFocusSeconds: 1500, breakSeconds: 0, clientSessionId: '22222222-2222-4222-8222-222222222222' }],
      }),
    ],
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

// 다시 보내도 결과가 같은 오류(400, 404, 409 IDEMPOTENCY_CONFLICT)에 완료가 영영 막히지 않게 백그라운드 동기화처럼 건너뛴다
describe('postSessions', () => {
  const a = { sessionFocusSeconds: 600, breakSeconds: 0, clientSessionId: 'a' }
  const b = { sessionFocusSeconds: 900, breakSeconds: 0, clientSessionId: 'b' }

  it.each([
    ['409 IDEMPOTENCY_CONFLICT', { status: 409, code: 'IDEMPOTENCY_CONFLICT' }],
    ['400', { status: 400 }],
    ['404', { status: 404 }],
  ])('%s 오류는 건너뛰고 다음 세션을 보낸다', async (_name, error) => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const post = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce(undefined)

    await expect(postSessions([a, b], post)).resolves.toBeUndefined()
    expect(post).toHaveBeenCalledTimes(2)
    expect(post).toHaveBeenLastCalledWith(b)
  })

  it('다시 보내면 될 수 있는 오류(5xx, 네트워크)는 그대로 던진다', async () => {
    const post = vi.fn().mockRejectedValueOnce({ status: 500 })

    await expect(postSessions([a, b], post)).rejects.toEqual({ status: 500 })
    expect(post).toHaveBeenCalledTimes(1)
  })

  it('0초 세션은 보내지 않는다', async () => {
    const post = vi.fn().mockResolvedValue(undefined)

    await postSessions([{ ...a, sessionFocusSeconds: 0 }, b], post)
    expect(post).toHaveBeenCalledTimes(1)
  })
})

