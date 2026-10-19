import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TodoList } from '../../api/types'
import { queryKeys } from '../../lib/queryKeys'
import { renderApp } from '../../test/renderApp'
import { FADE_PHASE_END_MS, setSoundEngineForTest, type SoundEngine } from './soundEngine'
import { useSoundscapeStore } from './soundscapeStore'
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
    elapsedMs: 0,
    initialFocusMs: 0,
    startedAt: null,
    cycleCount: 0,
    settingsSnapshot: settings,
    flexiblePhase: 'focus' as const,
    focusElapsedMs: 90_000,
    breakElapsedMs: 0,
    breakTargetMs: null,
    breakCompleted: false,
    focusStartedAt: null,
    breakStartedAt: null,
    breakSessionPendingUpdate: false,
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
    commitPendingFocus: vi.fn(),
  }

  return {
    settings,
    timerState,
    timerStoreActions,
    updateTodoMutate: vi.fn(),
    updateTodoMutateAsync: vi.fn(),
    createSessionMutateAsync: vi.fn(),
    toastSuccess: vi.fn(),
    toastError: vi.fn(),
  }
})

vi.mock('../settings/hooks', () => ({
  usePomodoroSettings: () => ({ data: mocked.settings }),
}))

vi.mock('../todos/hooks', () => ({
  useCreateSession: () => ({
    mutateAsync: mocked.createSessionMutateAsync,
    isPending: false,
  }),
  useUpdateTodo: () => ({
    mutate: mocked.updateTodoMutate,
    mutateAsync: mocked.updateTodoMutateAsync,
    isPending: false,
  }),
}))

vi.mock('react-hot-toast', () => ({
  toast: {
    success: mocked.toastSuccess,
    error: mocked.toastError,
  },
}))

vi.mock('./timerStore', () => ({
  useTimer: () => mocked.timerState,
  useTimerStore: (selector: (state: typeof mocked.timerStoreActions) => unknown) =>
    selector(mocked.timerStoreActions),
}))

describe('TimerFullScreen', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    Object.assign(mocked.timerState, {
      mode: 'stopwatch',
      phase: 'flow',
      status: 'paused',
      endAt: null,
      remainingMs: null,
      elapsedMs: 0,
      initialFocusMs: 0,
      startedAt: null,
      cycleCount: 0,
      settingsSnapshot: mocked.settings,
      flexiblePhase: 'focus',
      focusElapsedMs: 90_000,
      breakElapsedMs: 0,
      breakTargetMs: null,
      breakCompleted: false,
      focusStartedAt: null,
      breakStartedAt: null,
      breakSessionPendingUpdate: false,
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
    mocked.updateTodoMutate.mockClear()
    mocked.updateTodoMutateAsync.mockReset()
    mocked.updateTodoMutateAsync.mockResolvedValue(undefined)
    mocked.createSessionMutateAsync.mockReset()
    mocked.createSessionMutateAsync.mockResolvedValue(undefined)
    mocked.toastSuccess.mockClear()
    mocked.toastError.mockClear()

    useSoundscapeStore.getState().stopSession()
    useSoundscapeStore.setState({ phase: 'stopped' })
    localStorage.removeItem('flowmate/ui/sound-prefs')
  })

  it('resumes a paused timer and keeps fullscreen open when the timer is reset', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()

    renderApp(
      <TimerFullScreen
        isOpen
        onClose={onClose}
        todoId="todo-1"
        todoTitle="타이머 테스트"
        sessionFocusSeconds={1500}
        sessionCount={3}
        initialMode="stopwatch"
        isDone={false}
      />,
    )

    await user.click(await screen.findByRole('button', { name: '재개' }))
    expect(mocked.timerStoreActions.resume).toHaveBeenCalledWith('todo-1')

    await user.click(screen.getByRole('button', { name: '배경 음악 켜기' }))

    await user.click(screen.getByTitle('전체 리셋'))
    await user.click(screen.getByRole('button', { name: '확인' }))

    expect(mocked.timerStoreActions.reset).toHaveBeenCalledWith('todo-1')
    expect(mocked.timerStoreActions.initStopwatch).toHaveBeenCalledWith(
      'todo-1',
      1_500_000,
      mocked.settings,
    )
    expect(onClose).not.toHaveBeenCalled()
    expect(await screen.findByText('타이머 테스트')).toBeInTheDocument()
    expect(useSoundscapeStore.getState()).toMatchObject({
      enabled: false,
      currentTrackId: null,
    })
  })

  it('creates a session and completes the todo when finishing from stopwatch mode', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()

    Object.assign(mocked.timerState, {
      status: 'paused',
      focusElapsedMs: 120_000,
      initialFocusMs: 0,
      sessions: [],
      breakElapsedMs: 0,
      breakStartedAt: null,
      flexiblePhase: 'focus',
    })

    renderApp(
      <TimerFullScreen
        isOpen
        onClose={onClose}
        todoId="todo-1"
        todoTitle="타이머 테스트"
        sessionFocusSeconds={0}
        sessionCount={0}
        initialMode="stopwatch"
        isDone={false}
      />,
    )

    await user.click(await screen.findByRole('button', { name: '완료' }))
    expect(
      screen.getByText('현재 진행 상황이 저장되고 타이머가 초기화됩니다.'),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '확인' }))

    await waitFor(() => {
      expect(mocked.createSessionMutateAsync).toHaveBeenCalledWith({
        todoId: 'todo-1',
        body: expect.objectContaining({
          sessionFocusSeconds: 120,
          breakSeconds: 0,
          clientSessionId: expect.any(String),
        }),
      })
      expect(mocked.updateTodoMutateAsync).toHaveBeenCalledWith({
        id: 'todo-1',
        patch: {
          isDone: true,
          timerMode: 'stopwatch',
        },
      })
      expect(mocked.timerStoreActions.reset).toHaveBeenCalledWith('todo-1')
      expect(onClose).toHaveBeenCalled()
    })

    expect(useSoundscapeStore.getState()).toMatchObject({
      enabled: false,
      currentTrackId: null,
    })
  })

  it.each(['stopwatch', 'pomodoro'] as const)(
    'does not add the completed %s focus twice when the session refetch updates the cache first',
    async (mode) => {
      const user = userEvent.setup()

      Object.assign(mocked.timerState, {
        mode,
        phase: 'flow',
        status: 'paused',
        focusElapsedMs: 240_000,
        initialFocusMs: 120_000,
        remainingMs: mode === 'pomodoro' ? mocked.settings.flowMin * 60_000 - 120_000 : null,
        sessions: [],
        breakElapsedMs: 0,
        breakStartedAt: null,
        flexiblePhase: mode === 'stopwatch' ? 'focus' : null,
      })

      const view = renderApp(
        <TimerFullScreen
          isOpen
          onClose={vi.fn()}
          todoId="todo-1"
          todoTitle="타이머 테스트"
          sessionFocusSeconds={120}
          sessionCount={1}
          initialMode={mode}
          isDone={false}
        />,
      )
      view.queryClient.setQueryDefaults(queryKeys.todos(), { gcTime: Number.POSITIVE_INFINITY })
      const baseTodo = {
        id: 'todo-1',
        title: '타이머 테스트',
        note: null,
        date: '2026-07-14',
        miniDay: 0,
        dayOrder: 0,
        isDone: false,
        sessionCount: 1,
        sessionFocusSeconds: 120,
        timerMode: mode,
        createdAt: '2026-07-14T00:00:00Z',
        updatedAt: '2026-07-14T00:00:00Z',
      }
      view.queryClient.setQueryData<TodoList>(queryKeys.todos(), { items: [baseTodo] })
      mocked.createSessionMutateAsync.mockImplementationOnce(async () => {
        view.queryClient.setQueryData<TodoList>(queryKeys.todos(), {
          items: [{ ...baseTodo, sessionCount: 2, sessionFocusSeconds: 240 }],
        })
      })

      await user.click(await screen.findByRole('button', { name: '완료' }))
      await user.click(screen.getByRole('button', { name: '확인' }))

      await waitFor(() => {
        expect(mocked.updateTodoMutateAsync).toHaveBeenCalled()
      })
      expect(view.queryClient.getQueryData<TodoList>(queryKeys.todos())?.items[0]).toMatchObject({
        sessionCount: 2,
        sessionFocusSeconds: 240,
      })
    },
  )

  it('keeps the completion modal open when immediate session sync fails', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    mocked.createSessionMutateAsync.mockRejectedValueOnce(new Error('session sync failed'))

    renderApp(
      <TimerFullScreen
        isOpen
        onClose={onClose}
        todoId="todo-1"
        todoTitle="타이머 테스트"
        sessionFocusSeconds={0}
        sessionCount={0}
        initialMode="stopwatch"
        isDone={false}
      />,
    )

    await user.click(await screen.findByRole('button', { name: '완료' }))
    await user.click(screen.getByRole('button', { name: '확인' }))

    await waitFor(() => {
      expect(mocked.toastError).toHaveBeenCalledWith(
        '타이머 저장에 실패했습니다. 다시 시도해주세요.',
        { id: 'timer-save-failed' },
      )
    })
    expect(screen.getByText('타이머를 완료하시겠습니까?')).toBeInTheDocument()
    expect(mocked.timerStoreActions.updateSessions).not.toHaveBeenCalled()
    expect(mocked.updateTodoMutateAsync).not.toHaveBeenCalled()
    expect(mocked.timerStoreActions.reset).not.toHaveBeenCalled()
    expect(mocked.toastSuccess).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  const renderTimer = (props: { isOpen?: boolean; todoId?: string } = {}) => (
    <TimerFullScreen
      isOpen={props.isOpen ?? true}
      onClose={vi.fn()}
      todoId={props.todoId ?? 'todo-1'}
      todoTitle="타이머 테스트"
      sessionFocusSeconds={1500}
      sessionCount={3}
      initialMode="stopwatch"
      isDone={false}
    />
  )

  it('plays on focus toggle, fades out on break, and resumes when focus returns', async () => {
    const user = userEvent.setup()
    const engine: SoundEngine = {
      resume: vi.fn(),
      setMasterVolume: vi.fn(),
      play: vi.fn<SoundEngine['play']>().mockResolvedValue('ok'),
      setVolume: vi.fn(),
      fadeOutAndPause: vi.fn<SoundEngine['fadeOutAndPause']>().mockResolvedValue(undefined),
      stop: vi.fn(),
      onEnded: vi.fn(() => () => {}),
      onError: vi.fn(() => () => {}),
    }
    setSoundEngineForTest(engine)
    try {
      Object.assign(mocked.timerState, {
        status: 'running',
        flexiblePhase: 'focus',
      })

      const view = renderApp(renderTimer())

      await user.click(await screen.findByRole('button', { name: '배경 음악 켜기' }))
      await waitFor(() => expect(engine.play).toHaveBeenCalledWith('music', expect.any(String), 1))
      const playedInFocus = vi.mocked(engine.play).mock.calls.length

      Object.assign(mocked.timerState, {
        status: 'running',
        flexiblePhase: 'break_suggested',
      })
      view.rerender(renderTimer())

      await waitFor(() => expect(engine.fadeOutAndPause).toHaveBeenCalledWith('music', FADE_PHASE_END_MS))

      Object.assign(mocked.timerState, {
        status: 'running',
        flexiblePhase: 'focus',
      })
      view.rerender(renderTimer())

      await waitFor(() => expect(vi.mocked(engine.play).mock.calls.length).toBeGreaterThan(playedInFocus))
    } finally {
      setSoundEngineForTest(null)
    }
  })

  it('shows the preset label instead of exposing per-track controls', async () => {
    renderApp(
      <TimerFullScreen
        isOpen
        onClose={vi.fn()}
        todoId="todo-1"
        todoTitle="타이머 테스트"
        sessionFocusSeconds={1500}
        sessionCount={3}
        initialMode="stopwatch"
        isDone={false}
      />,
    )

    expect(await screen.findByText('비 오는 카페')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /트랙 선택:/ })).not.toBeInTheDocument()
    expect(screen.queryByText('Focus Study')).not.toBeInTheDocument()
  })


  it('starts sound when enabled during a running focus phase', async () => {
    const user = userEvent.setup()
    Object.assign(mocked.timerState, { status: 'running', flexiblePhase: 'focus' })

    renderApp(renderTimer())

    await user.click(await screen.findByRole('button', { name: '배경 음악 켜기' }))
    await waitFor(() =>
      expect(useSoundscapeStore.getState()).toMatchObject({ enabled: true, phase: 'focus' }),
    )
  })

  it('moves sound to break phase when the timer enters a break', async () => {
    Object.assign(mocked.timerState, { status: 'running', flexiblePhase: 'focus' })

    const view = renderApp(renderTimer())
    await waitFor(() => expect(useSoundscapeStore.getState().phase).toBe('focus'))

    Object.assign(mocked.timerState, { flexiblePhase: 'break_suggested' })
    view.rerender(renderTimer())

    await waitFor(() => expect(useSoundscapeStore.getState().phase).toBe('break'))
  })

  it('plays after closing and reopening a running focus timer', async () => {
    const user = userEvent.setup()
    const playSpy = vi.spyOn(window.HTMLMediaElement.prototype, 'play')
    Object.assign(mocked.timerState, { status: 'running', flexiblePhase: 'focus' })

    const view = renderApp(renderTimer())
    await waitFor(() => expect(useSoundscapeStore.getState().phase).toBe('focus'))

    view.rerender(renderTimer({ isOpen: false, todoId: '' }))
    view.rerender(renderTimer({ isOpen: true, todoId: 'todo-1' }))

    await user.click(await screen.findByRole('button', { name: '배경 음악 켜기' }))
    await waitFor(() => {
      expect(playSpy).toHaveBeenCalled()
      expect(useSoundscapeStore.getState().phase).toBe('focus')
    })
  })

  it('renders and controls the timer when the sound engine fails', async () => {
    const user = userEvent.setup()
    const failing = new Proxy({}, {
      get: () => () => {
        throw new Error('engine down')
      },
    }) as SoundEngine
    setSoundEngineForTest(failing)
    try {
      Object.assign(mocked.timerState, { status: 'running', flexiblePhase: 'focus' })

      renderApp(renderTimer())

      await user.click(await screen.findByRole('button', { name: '배경 음악 켜기' }))
      await user.click(await screen.findByRole('button', { name: '일시정지' }))

      expect(mocked.timerStoreActions.pause).toHaveBeenCalled()
      expect(screen.getByText('타이머 테스트')).toBeInTheDocument()
    } finally {
      setSoundEngineForTest(null)
    }
  })

  it('resets the music session when closing fullscreen', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()

    Object.assign(mocked.timerState, {
      status: 'running',
      flexiblePhase: 'focus',
    })

    renderApp(
      <TimerFullScreen
        isOpen
        onClose={onClose}
        todoId="todo-1"
        todoTitle="타이머 테스트"
        sessionFocusSeconds={1500}
        sessionCount={3}
        initialMode="stopwatch"
        isDone={false}
      />,
    )

    await user.click(await screen.findByRole('button', { name: '배경 음악 켜기' }))

    await user.click(screen.getByRole('button', { name: '타이머 닫기' }))

    expect(onClose).toHaveBeenCalled()
    expect(useSoundscapeStore.getState()).toMatchObject({
      enabled: false,
      currentTrackId: null,
    })
  })

  it('resets the music session when fullscreen unmounts without an explicit close action', async () => {
    const user = userEvent.setup()

    Object.assign(mocked.timerState, {
      status: 'running',
      flexiblePhase: 'focus',
    })

    const view = renderApp(
      <TimerFullScreen
        isOpen
        onClose={vi.fn()}
        todoId="todo-1"
        todoTitle="타이머 테스트"
        sessionFocusSeconds={1500}
        sessionCount={3}
        initialMode="stopwatch"
        isDone={false}
      />,
    )

    await user.click(await screen.findByRole('button', { name: '배경 음악 켜기' }))

    view.unmount()

    expect(useSoundscapeStore.getState()).toMatchObject({
      enabled: false,
      currentTrackId: null,
    })
  })

  it('disables the pomodoro break button before the flow starts', async () => {
    const user = userEvent.setup()

    Object.assign(mocked.timerState, {
      mode: 'pomodoro',
      phase: 'flow',
      status: 'idle',
      remainingMs: mocked.settings.flowMin * 60_000,
      flexiblePhase: null,
    })

    renderApp(
      <TimerFullScreen
        isOpen
        onClose={vi.fn()}
        todoId="todo-1"
        todoTitle="타이머 테스트"
        sessionFocusSeconds={0}
        sessionCount={0}
        initialMode="pomodoro"
        isDone={false}
      />,
    )

    const breakButton = await screen.findByRole('button', { name: '휴식' })
    expect(breakButton).toBeDisabled()
    await user.click(breakButton)
    expect(mocked.timerStoreActions.skipToNext).not.toHaveBeenCalled()
  })

  it('keeps the pomodoro break button enabled while the flow is running', async () => {
    const user = userEvent.setup()

    Object.assign(mocked.timerState, {
      mode: 'pomodoro',
      phase: 'flow',
      status: 'running',
      endAt: Date.now() + 10 * 60_000,
      flexiblePhase: null,
    })

    renderApp(
      <TimerFullScreen
        isOpen
        onClose={vi.fn()}
        todoId="todo-1"
        todoTitle="타이머 테스트"
        sessionFocusSeconds={0}
        sessionCount={0}
        initialMode="pomodoro"
        isDone={false}
      />,
    )

    await user.click(await screen.findByRole('button', { name: '휴식' }))
    expect(mocked.timerStoreActions.skipToNext).toHaveBeenCalledWith('todo-1')
  })

  it('runs completion only once when the confirm button is tapped twice', async () => {
    const user = userEvent.setup()

    Object.assign(mocked.timerState, {
      status: 'paused',
      focusElapsedMs: 120_000,
      initialFocusMs: 0,
      sessions: [],
      flexiblePhase: 'focus',
    })

    let resolveSession: () => void = () => {}
    mocked.createSessionMutateAsync.mockImplementation(
      () => new Promise<void>((resolve) => {
        resolveSession = resolve
      }),
    )

    renderApp(
      <TimerFullScreen
        isOpen
        onClose={vi.fn()}
        todoId="todo-1"
        todoTitle="타이머 테스트"
        sessionFocusSeconds={0}
        sessionCount={0}
        initialMode="stopwatch"
        isDone={false}
      />,
    )

    await user.click(await screen.findByRole('button', { name: '완료' }))
    const confirmButton = screen.getByRole('button', { name: '확인' })
    await user.click(confirmButton)
    await user.click(confirmButton)

    expect(mocked.createSessionMutateAsync).toHaveBeenCalledTimes(1)

    resolveSession()
    await waitFor(() => expect(mocked.updateTodoMutateAsync).toHaveBeenCalledTimes(1))
  })
})
