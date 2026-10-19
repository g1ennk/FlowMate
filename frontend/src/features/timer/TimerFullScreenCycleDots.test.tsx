import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderApp } from '../../test/renderApp'
import { TimerFullScreen } from './TimerFullScreen'

// 진행 중인 타이머는 시작할 때의 설정(settingsSnapshot)으로 돈다.
// 설정에서 주기를 바꿔도 진행 점 개수는 다음 시작부터 바뀌어야 한다.
const mocked = vi.hoisted(() => {
  const snapshot = {
    flowMin: 25,
    breakMin: 5,
    longBreakMin: 15,
    cycleEvery: 4,
    autoStartBreak: false,
    autoStartSession: false,
  }
  const currentSettings = { ...snapshot, cycleEvery: 6 }
  const timerState = {
    mode: 'pomodoro' as const,
    phase: 'flow' as const,
    status: 'paused' as const,
    endAt: null,
    remainingMs: 10 * 60_000,
    elapsedMs: 0,
    initialFocusMs: 0,
    startedAt: null,
    cycleCount: 1,
    settingsSnapshot: snapshot,
    flexiblePhase: null,
    focusElapsedMs: 0,
    breakElapsedMs: 0,
    breakTargetMs: null,
    breakCompleted: false,
    focusStartedAt: null,
    breakStartedAt: null,
    breakSessionPendingUpdate: false,
    sessions: [],
  }
  const actions = {
    initPomodoro: vi.fn(),
    initStopwatch: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    reset: vi.fn(),
    skipToNext: vi.fn(),
    getTimer: vi.fn(() => timerState),
    startBreak: vi.fn(),
    resumeFocus: vi.fn(),
    calculateBreakSuggestion: vi.fn(),
    updateSessions: vi.fn(),
    commitPendingFocus: vi.fn(),
  }
  return { currentSettings, timerState, actions }
})

vi.mock('../settings/hooks', () => ({
  usePomodoroSettings: () => ({ data: mocked.currentSettings }),
}))

vi.mock('../todos/hooks', () => ({
  useCreateSession: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateTodo: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}))

vi.mock('./timerStore', () => ({
  useTimer: () => mocked.timerState,
  useTimerStore: (selector: (state: typeof mocked.actions) => unknown) => selector(mocked.actions),
}))

describe('TimerFullScreen cycle dots', () => {
  it('counts dots by the running timer snapshot, not the newly changed setting', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

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

    const remaining = await screen.findByText('10:00')
    const dots = remaining.nextElementSibling
    expect(dots?.children).toHaveLength(4)
  })
})
