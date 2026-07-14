import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TodoList } from '../../api/types'
import { queryKeys } from '../../lib/queryKeys'
import { renderApp } from '../../test/renderApp'
import { DEFAULT_MUSIC_TRACK_INDEX, MUSIC_LABEL } from './musicTracks'
import { DEFAULT_MUSIC_VOLUME, useMusicStore } from './musicStore'
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

    useMusicStore.getState().stopSession()
    useMusicStore.setState({
      enabled: false,
      currentTrackIndex: DEFAULT_MUSIC_TRACK_INDEX,
      isPlaying: false,
      volume: DEFAULT_MUSIC_VOLUME,
    })
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
    expect(useMusicStore.getState()).toMatchObject({
      enabled: false,
      currentTrackIndex: DEFAULT_MUSIC_TRACK_INDEX,
      isPlaying: false,
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

    expect(useMusicStore.getState()).toMatchObject({
      enabled: false,
      currentTrackIndex: DEFAULT_MUSIC_TRACK_INDEX,
      isPlaying: false,
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

  it('plays on focus toggle, pauses on break, and resumes when focus returns', async () => {
    const user = userEvent.setup()
    const playSpy = vi.spyOn(window.HTMLMediaElement.prototype, 'play')
    const pauseSpy = vi.spyOn(window.HTMLMediaElement.prototype, 'pause')

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
    await waitFor(() => expect(playSpy).toHaveBeenCalledTimes(1))

    Object.assign(mocked.timerState, {
      status: 'running',
      flexiblePhase: 'break_suggested',
    })
    view.rerender(
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

    await waitFor(() => expect(pauseSpy).toHaveBeenCalled())

    Object.assign(mocked.timerState, {
      status: 'running',
      flexiblePhase: 'focus',
    })
    view.rerender(
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

    await waitFor(() => expect(playSpy).toHaveBeenCalledTimes(2))
  })

  it('shows a single Lo-fi label instead of exposing per-track controls', async () => {
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

    expect(await screen.findByText(MUSIC_LABEL)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /트랙 선택:/ })).not.toBeInTheDocument()
    expect(screen.queryByText('Focus Study')).not.toBeInTheDocument()
  })

  it('cycles through bundled tracks automatically while focus music stays enabled', async () => {
    const user = userEvent.setup()
    const playSpy = vi.spyOn(window.HTMLMediaElement.prototype, 'play')

    Object.assign(mocked.timerState, {
      status: 'running',
      flexiblePhase: 'focus',
    })

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

    await user.click(await screen.findByRole('button', { name: '배경 음악 켜기' }))
    await waitFor(() => expect(playSpy).toHaveBeenCalledTimes(1))

    const audio = playSpy.mock.contexts[0] as HTMLAudioElement

    audio.dispatchEvent(new Event('ended'))
    await waitFor(() => {
      expect(playSpy).toHaveBeenCalledTimes(2)
      expect(useMusicStore.getState().currentTrackIndex).toBe(1)
    })

    audio.dispatchEvent(new Event('ended'))
    await waitFor(() => {
      expect(playSpy).toHaveBeenCalledTimes(3)
      expect(useMusicStore.getState().currentTrackIndex).toBe(2)
    })

    audio.dispatchEvent(new Event('ended'))
    await waitFor(() => {
      expect(playSpy).toHaveBeenCalledTimes(4)
      expect(useMusicStore.getState().currentTrackIndex).toBe(DEFAULT_MUSIC_TRACK_INDEX)
    })
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
    expect(useMusicStore.getState()).toMatchObject({
      enabled: false,
      currentTrackIndex: DEFAULT_MUSIC_TRACK_INDEX,
      isPlaying: false,
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

    expect(useMusicStore.getState()).toMatchObject({
      enabled: false,
      currentTrackIndex: DEFAULT_MUSIC_TRACK_INDEX,
      isPlaying: false,
    })
  })
})
