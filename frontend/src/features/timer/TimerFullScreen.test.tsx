import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TodoList } from '../../api/types'
import { queryKeys } from '../../lib/queryKeys'
import { renderApp } from '../../test/renderApp'
import { FADE_PHASE_END_MS, setSoundEngineForTest, type SoundEngine } from './soundEngine'
import { useSoundscapeStore } from './soundscapeStore'
import { useTimerDisplayStore } from './timerDisplayStore'
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

    useTimerDisplayStore.getState().resetDisplay()
    useSoundscapeStore.getState().stopSession()
    useSoundscapeStore.setState({ enabled: false, phase: 'stopped' })
    localStorage.removeItem('flowmate/ui/sound-prefs')
  })


  // 사운드 켜기/끄기는 타이머 화면 사운드 줄의 스피커 버튼이다
  async function turnSoundOn(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole('button', { name: '사운드', pressed: false }))
  }

  // 완료 확인은 타이머 위에 뜨는 확인 시트다
  function completeDialog() {
    return screen.getByRole('dialog', { name: '이 할 일을 완료할까요?' })
  }

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

    await turnSoundOn(user)

    await user.click(screen.getByRole('button', { name: '초기화' }))
    const resetDialog = await screen.findByRole('dialog', { name: '타이머를 초기화할까요?' })
    // 본문은 두 줄이다: 무엇이 돌아가는지, 무엇이 남는지
    expect(within(resetDialog).getByText(/지금 진행 중인 구간만 처음으로 돌려요\./).textContent).toBe(
      '지금 진행 중인 구간만 처음으로 돌려요.\n이미 기록된 집중은 남아요.',
    )
    await user.click(within(resetDialog).getByRole('button', { name: '초기화' }))

    expect(mocked.timerStoreActions.reset).toHaveBeenCalledWith('todo-1')
    expect(mocked.timerStoreActions.initStopwatch).toHaveBeenCalledWith(
      'todo-1',
      1_500_000,
      mocked.settings,
    )
    expect(onClose).not.toHaveBeenCalled()
    expect(await screen.findByText('타이머 테스트')).toBeInTheDocument()
    // 초기화는 켜 둔 선택을 지우지 않고 사운드 세션도 열어 둔다(조용해지는 건 단계가 바뀌어서다)
    expect(useSoundscapeStore.getState()).toMatchObject({ enabled: true, active: true })
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
    expect(within(completeDialog()).getByText('이 할 일에 집중 1회, 2분이 기록돼요.')).toBeInTheDocument()
    expect(within(completeDialog()).getByRole('button', { name: '계속 집중' })).toBeInTheDocument()
    await user.click(within(completeDialog()).getByRole('button', { name: '완료' }))

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
      await user.click(within(completeDialog()).getByRole('button', { name: '완료' }))

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
    await user.click(within(completeDialog()).getByRole('button', { name: '완료' }))

    await waitFor(() => {
      // 성공 토스트("할 일을 완료했어요") 대신 기록을 저장하지 못해 완료하지 않았다고 알린다
      expect(mocked.toastError).toHaveBeenCalledWith(
        '집중 기록을 저장하지 못해서 완료하지 않았어요. 다시 시도해 주세요.',
        { id: 'timer-save-failed', duration: 5000 },
      )
    })
    expect(completeDialog()).toBeInTheDocument()
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

      await turnSoundOn(user)
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

  it('서버 연결 배너가 떠 있으면 헤더를 배너 아래로 내린다', async () => {
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

    const header = (await screen.findByRole('button', { name: '타이머 닫기' })).closest('header')
    expect(header?.style.paddingTop).toContain('--top-banner-offset')
  })

  it('registers as an overlay while open so the app behind is locked and toasts move to the top', async () => {
    const { unmount } = renderApp(
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

    await screen.findByRole('button', { name: '타이머 닫기' })
    expect(document.body.style.overflow).toBe('hidden')

    unmount()
    expect(document.body.style.overflow).toBe('')
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

    await turnSoundOn(user)
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

    await turnSoundOn(user)
    await waitFor(() => {
      expect(playSpy).toHaveBeenCalled()
      expect(useSoundscapeStore.getState().phase).toBe('focus')
    })
  })

  it('resets the shared display toggle when closing so the tab title returns to the current session', async () => {
    const user = userEvent.setup()
    Object.assign(mocked.timerState, { status: 'running', flexiblePhase: 'focus' })

    const view = renderApp(renderTimer())
    await user.click(await screen.findByRole('radio', { name: '전체 누적' }))
    expect(useTimerDisplayStore.getState().showTotalFocus).toBe(true)

    view.rerender(renderTimer({ isOpen: false, todoId: '' }))
    expect(useTimerDisplayStore.getState().showTotalFocus).toBe(false)
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

      await turnSoundOn(user)
      await user.click(await screen.findByRole('button', { name: '일시정지' }))

      expect(mocked.timerStoreActions.pause).toHaveBeenCalled()
      expect(screen.getByText('타이머 테스트')).toBeInTheDocument()
    } finally {
      setSoundEngineForTest(null)
    }
  })

  it('stops sound when the timer closes and plays it again on reopen without turning it off', async () => {
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
      await turnSoundOn(user)
      await waitFor(() => expect(engine.play).toHaveBeenCalledWith('music', expect.any(String), 1))

      view.rerender(renderTimer({ isOpen: false }))
      await waitFor(() => expect(engine.stop).toHaveBeenCalledWith('music'))
      expect(useSoundscapeStore.getState()).toMatchObject({ enabled: true, active: false, currentTrackId: null })

      vi.mocked(engine.play).mockClear()
      view.rerender(renderTimer())
      await waitFor(() => expect(engine.play).toHaveBeenCalledWith('music', expect.any(String), 1))
      expect(useSoundscapeStore.getState()).toMatchObject({ enabled: true, active: true })
      expect(await screen.findByRole('button', { name: '사운드', pressed: true })).toBeInTheDocument()
    } finally {
      setSoundEngineForTest(null)
    }
  })

  it('stops the music session when fullscreen unmounts without an explicit close action', async () => {
    const user = userEvent.setup()

    Object.assign(mocked.timerState, {
      status: 'running',
      flexiblePhase: 'focus',
    })

    const view = renderApp(renderTimer())

    await turnSoundOn(user)

    view.unmount()

    expect(useSoundscapeStore.getState()).toMatchObject({
      enabled: true,
      active: false,
      currentTrackId: null,
    })
  })

  it('hides the pomodoro break button before the flow starts', async () => {

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

    // 누를 수 없는 버튼은 보여 주지 않는다. 대기 상태의 버튼은 시작과 완료 두 개다
    expect(await screen.findByRole('button', { name: '시작' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '휴식' })).not.toBeInTheDocument()
    expect(mocked.timerStoreActions.skipToNext).not.toHaveBeenCalled()
  })

  it('hides the pomodoro break button while the next flow is waiting', async () => {
    Object.assign(mocked.timerState, {
      mode: 'pomodoro',
      phase: 'flow',
      status: 'waiting',
      endAt: null,
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

    expect(await screen.findByRole('button', { name: '집중 시작' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '휴식' })).not.toBeInTheDocument()
  })

  it('keeps the pomodoro break button enabled while the flow is paused', async () => {
    Object.assign(mocked.timerState, {
      mode: 'pomodoro',
      phase: 'flow',
      status: 'paused',
      endAt: null,
      remainingMs: 10 * 60_000,
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

    expect(await screen.findByRole('button', { name: '휴식' })).toBeEnabled()
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
    const confirmButton = within(completeDialog()).getByRole('button', { name: '완료' })
    await user.click(confirmButton)
    await user.click(confirmButton)

    expect(mocked.createSessionMutateAsync).toHaveBeenCalledTimes(1)

    resolveSession()
    await waitFor(() => expect(mocked.updateTodoMutateAsync).toHaveBeenCalledTimes(1))
  })

  describe('상태별 버튼 라벨', () => {
    function renderTimer(initialMode: 'stopwatch' | 'pomodoro') {
      return renderApp(
        <TimerFullScreen
          isOpen
          onClose={vi.fn()}
          todoId="todo-1"
          todoTitle="타이머 테스트"
          sessionFocusSeconds={0}
          sessionCount={0}
          initialMode={initialMode}
          isDone={false}
        />,
      )
    }

    it('처음 시작하기 전 뽀모도로는 "시작"으로 보인다', async () => {
      Object.assign(mocked.timerState, {
        mode: 'pomodoro',
        phase: 'flow',
        status: 'idle',
        remainingMs: mocked.settings.flowMin * 60_000,
        flexiblePhase: null,
      })

      renderTimer('pomodoro')

      expect(await screen.findByRole('button', { name: '시작' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: '재개' })).not.toBeInTheDocument()
    })

    it('처음 시작하기 전 일반 타이머는 "시작"으로 보인다', async () => {
      Object.assign(mocked.timerState, {
        mode: 'stopwatch',
        status: 'idle',
        flexiblePhase: 'focus',
        focusElapsedMs: 0,
      })

      renderTimer('stopwatch')

      expect(await screen.findByRole('button', { name: '시작' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: '재개' })).not.toBeInTheDocument()
    })

    it('일시정지한 뽀모도로는 "재개"로 보인다', async () => {
      Object.assign(mocked.timerState, {
        mode: 'pomodoro',
        phase: 'flow',
        status: 'paused',
        remainingMs: 10 * 60_000,
        flexiblePhase: null,
      })

      renderTimer('pomodoro')

      expect(await screen.findByRole('button', { name: '재개' })).toBeInTheDocument()
    })

    it('Flow가 끝나고 휴식을 기다릴 때는 안내 줄 없이 "휴식 시작", "휴식 건너뛰기"를 보여준다', async () => {
      const user = userEvent.setup()
      Object.assign(mocked.timerState, {
        mode: 'pomodoro',
        phase: 'short',
        status: 'waiting',
        endAt: null,
        remainingMs: mocked.settings.breakMin * 60_000,
        cycleCount: 1,
        flexiblePhase: null,
      })

      renderTimer('pomodoro')

      expect(await screen.findByRole('button', { name: '휴식 시작' })).toBeInTheDocument()
      expect(screen.queryByText('집중 끝')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: '재개' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: '집중 시작' })).not.toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: '휴식 시작' }))
      expect(mocked.timerStoreActions.resume).toHaveBeenCalledWith('todo-1')

      await user.click(screen.getByRole('button', { name: '휴식 건너뛰기' }))
      expect(mocked.timerStoreActions.skipToNext).toHaveBeenCalledWith('todo-1')
    })

    it('휴식이 끝나고 다음 Flow를 기다릴 때는 안내 줄 없이 "집중 시작"을 보여준다', async () => {
      Object.assign(mocked.timerState, {
        mode: 'pomodoro',
        phase: 'flow',
        status: 'waiting',
        endAt: null,
        remainingMs: mocked.settings.flowMin * 60_000,
        cycleCount: 1,
        flexiblePhase: null,
      })

      renderTimer('pomodoro')

      expect(await screen.findByRole('button', { name: '집중 시작' })).toBeInTheDocument()
      expect(screen.queryByText('휴식 끝')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: '재개' })).not.toBeInTheDocument()
    })

    it('일반 타이머 휴식 중에는 휴식을 끝내는 버튼이 "휴식 끝내기"로 보인다', async () => {
      const user = userEvent.setup()
      Object.assign(mocked.timerState, {
        mode: 'stopwatch',
        status: 'running',
        flexiblePhase: 'break_free',
        breakStartedAt: Date.now(),
      })

      renderTimer('stopwatch')

      await user.click(await screen.findByRole('button', { name: '휴식 끝내기' }))
      expect(mocked.timerStoreActions.resumeFocus).toHaveBeenCalledWith('todo-1')
      expect(screen.queryByRole('button', { name: '집중 시작' })).not.toBeInTheDocument()
    })

    it('휴식으로 가는 버튼과 휴식을 넘기는 버튼은 아이콘이 다르다', async () => {
      Object.assign(mocked.timerState, {
        mode: 'pomodoro',
        phase: 'flow',
        status: 'running',
        endAt: Date.now() + 10 * 60_000,
        flexiblePhase: null,
      })
      const { unmount } = renderTimer('pomodoro')
      const toBreakIcon = (await screen.findByRole('button', { name: '휴식' })).querySelector('svg')?.innerHTML

      unmount()
      Object.assign(mocked.timerState, {
        phase: 'short',
        status: 'running',
        endAt: Date.now() + 5 * 60_000,
      })
      renderTimer('pomodoro')
      const skipBreakIcon = (await screen.findByRole('button', { name: '휴식 건너뛰기' })).querySelector('svg')?.innerHTML

      expect(toBreakIcon).toBeTruthy()
      expect(skipBreakIcon).toBeTruthy()
      expect(toBreakIcon).not.toBe(skipBreakIcon)
    })
  })

  describe('Task 8: 위계와 의미', () => {
    function renderTimer(initialMode: 'stopwatch' | 'pomodoro', isDone = false) {
      return renderApp(
        <TimerFullScreen
          isOpen
          onClose={vi.fn()}
          todoId="todo-1"
          todoTitle="타이머 테스트"
          sessionFocusSeconds={0}
          sessionCount={0}
          initialMode={initialMode}
          isDone={isDone}
        />,
      )
    }
    const emphasis = (name: string) => screen.getByRole('button', { name }).getAttribute('data-emphasis')
    const pomodoro = (state: Record<string, unknown>) =>
      Object.assign(mocked.timerState, { mode: 'pomodoro', flexiblePhase: null, ...state })

    it('풀스크린은 할 일 이름을 가진 모달 dialog다', async () => {
      renderTimer('stopwatch')
      const dialog = await screen.findByRole('dialog', { name: '타이머 테스트 일반 타이머' })
      expect(dialog).toHaveAttribute('aria-modal', 'true')
      // 글자색을 앱 테마에서 물려받지 않는다(라이트와 다크에서 같은 색)
      expect(dialog).toHaveClass('text-timer-focus-text')
    })

    it('대기: 시작이 primary, 완료는 neutral', async () => {
      pomodoro({ phase: 'flow', status: 'idle', remainingMs: 25 * 60_000 })
      renderTimer('pomodoro')
      await screen.findByRole('button', { name: '시작' })
      expect(emphasis('시작')).toBe('primary')
      expect(emphasis('완료')).toBe('neutral')
    })

    it('진행: 일시정지가 primary, 휴식과 완료는 neutral', async () => {
      pomodoro({ phase: 'flow', status: 'running', endAt: Date.now() + 10 * 60_000 })
      renderTimer('pomodoro')
      await screen.findByRole('button', { name: '일시정지' })
      expect(emphasis('일시정지')).toBe('primary')
      expect(emphasis('휴식')).toBe('neutral')
      expect(emphasis('완료')).toBe('neutral')
    })

    it('일시정지: 재개가 primary, 숫자를 흐리게 하고 라벨에 일시정지를 붙인다', async () => {
      pomodoro({ phase: 'flow', status: 'paused', remainingMs: 10 * 60_000 })
      renderTimer('pomodoro')
      await screen.findByRole('button', { name: '재개' })
      expect(emphasis('재개')).toBe('primary')
      expect(screen.getByText('집중 · 일시정지')).toBeInTheDocument()
      expect(screen.getByText('10:00')).toHaveClass('opacity-50')
    })

    it('단계 끝: 다음 단계 시작이 primary이고, 끝 안내 줄은 어느 상태에도 없다', async () => {
      pomodoro({ phase: 'short', status: 'waiting', endAt: null, remainingMs: 5 * 60_000, cycleCount: 1 })
      const { unmount } = renderTimer('pomodoro')
      await screen.findByRole('button', { name: '휴식 시작' })
      expect(emphasis('휴식 시작')).toBe('primary')
      expect(emphasis('휴식 건너뛰기')).toBe('neutral')
      expect(screen.queryByText('집중 끝')).not.toBeInTheDocument()
      // 안내 줄 자리도 두지 않는다(어느 상태에서도 없으니 단계가 바뀌어도 숫자가 움직이지 않는다)
      expect(screen.queryByTestId('phase-end-notice')).not.toBeInTheDocument()
      unmount()

      pomodoro({ phase: 'flow', status: 'running', endAt: Date.now() + 10 * 60_000, cycleCount: 0 })
      renderTimer('pomodoro')
      await screen.findByRole('button', { name: '일시정지' })
      expect(screen.queryByTestId('phase-end-notice')).not.toBeInTheDocument()
    })

    it('할 일 완료 버튼은 휴식 중에도 neutral이다', async () => {
      pomodoro({ phase: 'short', status: 'running', endAt: Date.now() + 3 * 60_000, cycleCount: 1 })
      renderTimer('pomodoro')
      await screen.findByRole('button', { name: '일시정지' })
      expect(emphasis('완료')).toBe('neutral')
    })

    it('뽀모도로 휴식에도 진행 막대를 보여 준다', async () => {
      pomodoro({ phase: 'short', status: 'running', endAt: Date.now() + 3 * 60_000, remainingMs: null, cycleCount: 1 })
      renderTimer('pomodoro')
      await screen.findByRole('button', { name: '일시정지' })
      expect(screen.getByTestId('cycle-progress')).toBeInTheDocument()
    })

    it('헤더에는 모드 제목과 초기화가 없고, 초기화는 멈춘 상태에서만 글자 버튼으로 보인다', async () => {
      pomodoro({ phase: 'flow', status: 'running', endAt: Date.now() + 10 * 60_000 })
      const { unmount } = renderTimer('pomodoro')
      await screen.findByRole('button', { name: '일시정지' })
      const header = screen.getByRole('button', { name: '타이머 닫기' }).closest('header') as HTMLElement
      expect(within(header).queryByRole('button', { name: /초기화/ })).not.toBeInTheDocument()
      expect(screen.queryByText('뽀모도로 타이머')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: '초기화' })).not.toBeInTheDocument()
      unmount()

      pomodoro({ phase: 'flow', status: 'paused', endAt: null, remainingMs: 10 * 60_000 })
      const paused = renderTimer('pomodoro')
      expect(await screen.findByRole('button', { name: '초기화' })).toBeInTheDocument()
      paused.unmount()

      // 막 연 대기 상태(기록도 사이클도 없음)에서는 되돌릴 것이 없어 초기화를 숨긴다. 자리는 남는다
      pomodoro({ phase: 'flow', status: 'idle', endAt: null, remainingMs: 25 * 60_000, cycleCount: 0, sessions: [] })
      const fresh = renderTimer('pomodoro')
      await screen.findByRole('button', { name: '시작' })
      expect(screen.queryByRole('button', { name: '초기화' })).not.toBeInTheDocument()
      fresh.unmount()

      // 대기라도 지난 기록이 있으면 보인다
      pomodoro({ phase: 'flow', status: 'idle', endAt: null, remainingMs: 25 * 60_000, cycleCount: 1, sessions: [] })
      renderTimer('pomodoro')
      expect(await screen.findByRole('button', { name: '초기화' })).toBeInTheDocument()
    })

    it('뽀모도로 풀스크린 이름에 모드가 들어간다', async () => {
      pomodoro({ phase: 'flow', status: 'idle', remainingMs: 25 * 60_000 })
      renderTimer('pomodoro')
      expect(await screen.findByRole('dialog', { name: '타이머 테스트 뽀모도로 타이머' })).toBeInTheDocument()
    })

    it('뽀모도로를 막 시작하고 바로 완료하면(1분 미만) 확인 없이 완료한다', async () => {
      const user = userEvent.setup()
      pomodoro({ phase: 'flow', status: 'running', endAt: Date.now() + 25 * 60_000 - 5_000, remainingMs: null, sessions: [], cycleCount: 0 })
      renderTimer('pomodoro')

      await user.click(await screen.findByRole('button', { name: '완료' }))

      expect(screen.queryByRole('dialog', { name: '이 할 일을 완료할까요?' })).not.toBeInTheDocument()
      await waitFor(() =>
        expect(mocked.updateTodoMutateAsync).toHaveBeenCalledWith({
          id: 'todo-1',
          patch: expect.objectContaining({ isDone: true }),
        }),
      )
      expect(mocked.createSessionMutateAsync).not.toHaveBeenCalled()
    })

    it('스톱워치 표시 기준 토글은 대기 상태에서 숨기고, 시작한 뒤에 보인다', async () => {
      Object.assign(mocked.timerState, { mode: 'stopwatch', status: 'idle', flexiblePhase: 'focus', focusElapsedMs: 0 })
      const { unmount } = renderTimer('stopwatch')
      await screen.findByRole('button', { name: '시작' })
      expect(screen.queryByRole('radiogroup', { name: '스톱워치 표시 기준' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: '휴식' })).not.toBeInTheDocument()
      unmount()

      Object.assign(mocked.timerState, { status: 'paused', focusElapsedMs: 90_000 })
      renderTimer('stopwatch')
      expect(await screen.findByRole('radiogroup', { name: '스톱워치 표시 기준' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '휴식' })).toBeInTheDocument()
    })

    it('추천 휴식이 끝나면 "휴식 끝 · +1:00"과 휴식 끝내기 primary를 보여 준다', async () => {
      Object.assign(mocked.timerState, {
        mode: 'stopwatch',
        status: 'running',
        flexiblePhase: 'break_suggested',
        breakTargetMs: 300_000,
        breakElapsedMs: 360_000,
        breakCompleted: true,
        breakStartedAt: Date.now(),
      })
      renderTimer('stopwatch')
      expect(await screen.findByText('휴식 끝 · +1:00')).toBeInTheDocument()
      expect(emphasis('휴식 끝내기')).toBe('primary')
      expect(emphasis('일시정지')).toBe('neutral')
      // 넘친 시간은 라벨에, 전체 휴식 시간은 숫자에 함께 보이므로 추가/총 휴식 토글은 두지 않는다
      expect(screen.getByText('06:00')).toBeInTheDocument()
      expect(screen.queryByRole('radiogroup', { name: '휴식 표시 기준' })).not.toBeInTheDocument()
    })

    it('스톱워치 휴식 숫자는 뽀모도로 휴식과 같은 휴식 색이고, 완료한 집중 점에 크기가 있다', async () => {
      Object.assign(mocked.timerState, {
        mode: 'stopwatch',
        status: 'running',
        flexiblePhase: 'break_free',
        breakElapsedMs: 60_000,
        breakStartedAt: Date.now(),
        sessions: [
          { sessionFocusSeconds: 600, breakSeconds: 0, clientSessionId: 's1' },
          { sessionFocusSeconds: 600, breakSeconds: 0, clientSessionId: 's2' },
        ],
      })
      renderTimer('stopwatch')
      expect(await screen.findByText('01:00')).toHaveClass('text-timer-break-text')
      // 앞의 완료 점은 보이는 크기가 있고, 방금 끝낸 집중 자리는 휴식 막대다
      const dots = screen.getByRole('img', { name: /집중 2회/ })
      expect(dots.children).toHaveLength(2)
      expect(dots.children[0]).toHaveClass('h-2.5', 'w-2.5')
      expect(dots.children[1]).toHaveClass('h-3', 'w-10')
    })

    it('기록할 집중이 없으면 확인 없이 바로 완료한다', async () => {
      const user = userEvent.setup()
      Object.assign(mocked.timerState, { mode: 'stopwatch', status: 'paused', flexiblePhase: 'focus', focusElapsedMs: 30_000, sessions: [] })
      renderTimer('stopwatch')

      await user.click(await screen.findByRole('button', { name: '완료' }))

      expect(screen.queryByRole('dialog', { name: '이 할 일을 완료할까요?' })).not.toBeInTheDocument()
      await waitFor(() =>
        expect(mocked.updateTodoMutateAsync).toHaveBeenCalledWith({
          id: 'todo-1',
          patch: expect.objectContaining({ isDone: true }),
        }),
      )
    })

    it('완료 확인의 "계속 집중"은 아무것도 기록하지 않고 닫는다', async () => {
      const user = userEvent.setup()
      Object.assign(mocked.timerState, { mode: 'stopwatch', status: 'paused', flexiblePhase: 'focus', focusElapsedMs: 120_000 })
      renderTimer('stopwatch')

      await user.click(await screen.findByRole('button', { name: '완료' }))
      await user.click(within(screen.getByRole('dialog', { name: '이 할 일을 완료할까요?' })).getByRole('button', { name: '계속 집중' }))
      await act(async () => {})

      expect(mocked.updateTodoMutateAsync).not.toHaveBeenCalled()
      expect(mocked.createSessionMutateAsync).not.toHaveBeenCalled()
    })

    it('휴식 선택은 집중한 시간을 제목에 쓰고, 기호 없이 분으로 추천한다', async () => {
      const user = userEvent.setup()
      Object.assign(mocked.timerState, {
        mode: 'stopwatch',
        status: 'paused',
        flexiblePhase: 'focus',
        focusElapsedMs: 12 * 60_000,
        initialFocusMs: 0,
      })
      renderTimer('stopwatch')

      await user.click(await screen.findByRole('button', { name: '휴식' }))
      const sheet = await screen.findByRole('dialog', { name: '12분 집중했어요. 얼마나 쉴까요?' })
      expect(within(sheet).getByRole('button', { name: /추천 휴식.*5분/ })).toBeInTheDocument()
      expect(within(sheet).getByRole('button', { name: /자유 휴식.*원하는 만큼/ })).toBeInTheDocument()
      expect(sheet.textContent).not.toMatch(/∞|'/)
      expect(within(sheet).queryByRole('button', { name: '취소' })).not.toBeInTheDocument()

      await user.click(within(sheet).getByRole('button', { name: /추천 휴식/ }))
      expect(mocked.timerStoreActions.startBreak).toHaveBeenCalledWith('todo-1', 300_000)
    })

    it('사운드 줄은 켜기/끄기, 볼륨, 분위기 이름을 타이머 화면에 바로 둔다', async () => {
      renderTimer('stopwatch')
      const fullscreen = await screen.findByRole('dialog', { name: '타이머 테스트 일반 타이머' })
      expect(within(fullscreen).getByRole('button', { name: '사운드', pressed: false })).toBeInTheDocument()
      expect(within(fullscreen).getByRole('slider', { name: '전체 볼륨' })).toBeInTheDocument()
      expect(within(fullscreen).getByRole('button', { name: '분위기 선택: 비 오는 카페' })).toBeInTheDocument()
      expect(within(fullscreen).queryByRole('button', { name: /배경 음악/ })).not.toBeInTheDocument()
    })
  })
})
