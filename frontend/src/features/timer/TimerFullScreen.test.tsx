import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TimerFullScreen } from './TimerFullScreen'

const mocked = vi.hoisted(() => {
  const settings = {
    flowMin: 25,
    breakMin: 5,
    longBreakMin: 15,
    cycleEvery: 4,
    autoStartBreak: false,
    autoStartSession: false,
  }

  const timerState = {
    mode: 'stopwatch' as const,
    phase: 'flow' as const,
    status: 'paused' as const,
    endAt: null,
    remainingMs: null,
    elapsedMs: 1_500_000,
    initialFocusMs: 1_500_000,
    startedAt: null,
    cycleCount: 0,
    settingsSnapshot: settings,
    flexiblePhase: 'focus' as const,
    focusElapsedMs: 1_500_000,
    breakElapsedMs: 0,
    breakTargetMs: null,
    breakCompleted: false,
    focusStartedAt: null,
    breakStartedAt: null,
    sessions: [],
  }

  const timerStoreActions = {
    initPomodoro: vi.fn(),
    initStopwatch: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    reset: vi.fn(),
    skipToNext: vi.fn(),
    getTimer: vi.fn(() => timerState),
    startBreak: vi.fn(),
    resumeFocus: vi.fn(),
    calculateBreakSuggestion: vi.fn(() => ({
      targetMs: 300_000,
      targetMinutes: 5,
      message: 'Flow 25분 → 5분 휴식 추천',
    })),
    updateSessions: vi.fn(),
  }

  return {
    settings,
    settingsData: settings as typeof settings | undefined,
    timerState,
    timerStoreActions,
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    createSessionMutateAsync: vi.fn(),
    toastSuccess: vi.fn(),
  }
})

vi.mock('../settings/hooks', () => ({
  usePomodoroSettings: () => ({ data: mocked.settingsData }),
}))

vi.mock('../todos/hooks', () => ({
  useCreateSession: () => ({
    mutateAsync: mocked.createSessionMutateAsync,
    isPending: false,
  }),
  useUpdateTodo: () => ({
    mutate: mocked.mutate,
    mutateAsync: mocked.mutateAsync,
    isPending: false,
  }),
}))

vi.mock('react-hot-toast', () => ({
  toast: {
    success: mocked.toastSuccess,
  },
}))

vi.mock('./timerStore', () => ({
  useTimer: () => mocked.timerState,
  useTimerStore: (selector: (state: typeof mocked.timerStoreActions) => unknown) =>
    selector(mocked.timerStoreActions),
}))

describe('TimerFullScreen reset behavior', () => {
  beforeEach(() => {
    mocked.settingsData = mocked.settings
    Object.assign(mocked.timerState, {
      mode: 'stopwatch',
      phase: 'flow',
      status: 'paused',
      endAt: null,
      remainingMs: null,
      elapsedMs: 1_500_000,
      initialFocusMs: 1_500_000,
      cycleCount: 0,
      settingsSnapshot: mocked.settings,
      flexiblePhase: 'focus',
      focusElapsedMs: 1_500_000,
      breakElapsedMs: 0,
      breakTargetMs: null,
      breakCompleted: false,
      focusStartedAt: null,
      breakStartedAt: null,
      sessions: [],
    })

    mocked.timerStoreActions.initPomodoro.mockClear()
    mocked.timerStoreActions.initStopwatch.mockClear()
    mocked.timerStoreActions.pause.mockClear()
    mocked.timerStoreActions.resume.mockClear()
    mocked.timerStoreActions.reset.mockClear()
    mocked.timerStoreActions.skipToNext.mockClear()
    mocked.timerStoreActions.getTimer.mockClear()
    mocked.timerStoreActions.startBreak.mockClear()
    mocked.timerStoreActions.resumeFocus.mockClear()
    mocked.timerStoreActions.calculateBreakSuggestion.mockClear()
    mocked.timerStoreActions.updateSessions.mockClear()
    mocked.mutate.mockClear()
    mocked.mutateAsync.mockClear()
    mocked.createSessionMutateAsync.mockClear()
    mocked.toastSuccess.mockClear()
  })

  it('keeps fullscreen open and re-initializes stopwatch with server ms on reset', () => {
    const onClose = vi.fn()
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <TimerFullScreen
          isOpen
          onClose={onClose}
          todoId="todo-1"
          todoTitle="타이머 테스트"
          sessionFocusSeconds={1500}
          sessionCount={3}
          initialMode="stopwatch"
          isDone={false}
        />
      </QueryClientProvider>,
    )

    const currentLabel = screen.getByText('현재 세션')
    fireEvent.click(currentLabel.closest('button')!)
    expect(screen.getByText('전체 누적')).toBeInTheDocument()

    fireEvent.click(screen.getByTitle('전체 리셋'))
    fireEvent.click(screen.getByRole('button', { name: '확인' }))

    expect(mocked.timerStoreActions.reset).toHaveBeenCalledWith('todo-1')
    expect(mocked.timerStoreActions.initStopwatch).toHaveBeenCalledWith('todo-1', 1_500_000, mocked.settings)
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByText('현재 세션')).toBeInTheDocument()
  })

  it('resets tab to current session when reopened', () => {
    const onClose = vi.fn()
    const queryClient = new QueryClient()

    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <TimerFullScreen
          isOpen
          onClose={onClose}
          todoId="todo-1"
          todoTitle="타이머 테스트"
          sessionFocusSeconds={1500}
          sessionCount={3}
          initialMode="stopwatch"
          isDone={false}
        />
      </QueryClientProvider>,
    )

    const currentLabel = screen.getByText('현재 세션')
    fireEvent.click(currentLabel.closest('button')!)
    expect(screen.getByText('전체 누적')).toBeInTheDocument()

    rerender(
      <QueryClientProvider client={queryClient}>
        <TimerFullScreen
          isOpen={false}
          onClose={onClose}
          todoId="todo-1"
          todoTitle="타이머 테스트"
          sessionFocusSeconds={1500}
          sessionCount={3}
          initialMode="stopwatch"
          isDone={false}
        />
      </QueryClientProvider>,
    )

    rerender(
      <QueryClientProvider client={queryClient}>
        <TimerFullScreen
          isOpen
          onClose={onClose}
          todoId="todo-1"
          todoTitle="타이머 테스트"
          sessionFocusSeconds={1500}
          sessionCount={3}
          initialMode="stopwatch"
          isDone={false}
        />
      </QueryClientProvider>,
    )

    expect(screen.getByText('현재 세션')).toBeInTheDocument()
  })

  it('re-initializes pomodoro on reset even when settings query is unavailable', () => {
    mocked.settingsData = undefined
    Object.assign(mocked.timerState, {
      mode: 'pomodoro',
      phase: 'flow',
      status: 'paused',
      remainingMs: 600_000,
      endAt: null,
      elapsedMs: 0,
      initialFocusMs: 0,
      settingsSnapshot: null,
      flexiblePhase: null,
      focusElapsedMs: 0,
      breakElapsedMs: 0,
      breakTargetMs: null,
      breakCompleted: false,
      focusStartedAt: null,
      breakStartedAt: null,
      sessions: [],
    })

    const onClose = vi.fn()
    const queryClient = new QueryClient()

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <TimerFullScreen
          isOpen
          onClose={onClose}
          todoId="todo-1"
          todoTitle="타이머 테스트"
          sessionFocusSeconds={1500}
          sessionCount={3}
          initialMode="pomodoro"
          isDone={false}
        />
      </QueryClientProvider>,
    )

    // 서버 sessionCount=3이어도 타이머 상태(cycleCount=0)가 기준이라 초기 도트는 0이어야 한다.
    expect(container.querySelectorAll('span.bg-emerald-400').length).toBe(0)

    fireEvent.click(screen.getByTitle('전체 리셋'))
    fireEvent.click(screen.getByRole('button', { name: '확인' }))

    expect(mocked.timerStoreActions.reset).toHaveBeenCalledWith('todo-1')
    expect(mocked.timerStoreActions.initPomodoro).toHaveBeenCalledWith(
      'todo-1',
      expect.objectContaining({
        flowMin: 25,
        breakMin: 5,
        longBreakMin: 15,
        cycleEvery: 4,
      }),
    )
    expect(container.querySelectorAll('span.bg-emerald-400').length).toBe(0)
    expect(onClose).not.toHaveBeenCalled()
  })
})
