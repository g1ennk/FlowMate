import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderApp } from '../../test/renderApp'
import { DEFAULT_MUSIC_TRACK_INDEX, MUSIC_TRACKS } from './musicTracks'
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
  }

  return {
    settings,
    timerState,
    timerStoreActions,
    updateTodoMutate: vi.fn(),
    updateTodoMutateAsync: vi.fn(),
    createSessionMutateAsync: vi.fn(),
    toastSuccess: vi.fn(),
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
    await user.click(screen.getByRole('button', { name: `트랙 선택: ${MUSIC_TRACKS[0].displayName}` }))
    await user.click(screen.getByRole('button', { name: MUSIC_TRACKS[1].displayName }))

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
      expect(onClose).toHaveBeenCalled()
    })

    expect(useMusicStore.getState()).toMatchObject({
      enabled: false,
      currentTrackIndex: DEFAULT_MUSIC_TRACK_INDEX,
      isPlaying: false,
    })
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

  it('resets the music session when closing fullscreen after selecting a track', async () => {
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
    await user.click(screen.getByRole('button', { name: `트랙 선택: ${MUSIC_TRACKS[0].displayName}` }))
    await user.click(screen.getByRole('button', { name: MUSIC_TRACKS[1].displayName }))

    expect(screen.getByRole('button', { name: `트랙 선택: ${MUSIC_TRACKS[1].displayName}` })).toBeInTheDocument()

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
    await user.click(screen.getByRole('button', { name: `트랙 선택: ${MUSIC_TRACKS[0].displayName}` }))
    await user.click(screen.getByRole('button', { name: MUSIC_TRACKS[2].displayName }))

    view.unmount()

    expect(useMusicStore.getState()).toMatchObject({
      enabled: false,
      currentTrackIndex: DEFAULT_MUSIC_TRACK_INDEX,
      isPlaying: false,
    })
  })
})
