import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderApp } from '../../test/renderApp'
import { TimerFullScreen } from './TimerFullScreen'
import { useTimerStore } from './timerStore'
import type { SingleTimerState } from './timerTypes'

// NOTE: timerStore 는 실제(real) 구현을 사용한다. 이 버그는 완료 도중 store 의
// updateSessions 가 timer.sessions 를 변경 → 모달이 재렌더되며 이중 집계되는
// 반응성(reactivity) 문제이므로, store 를 mock 하면 재현되지 않는다.

const mocked = vi.hoisted(() => ({
  settings: {
    flowMin: 25,
    breakMin: 5,
    longBreakMin: 15,
    cycleEvery: 4,
    autoStartBreak: false,
    autoStartSession: false,
  },
  createSessionMutateAsync: vi.fn(),
  updateTodoMutateAsync: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('../settings/hooks', () => ({
  usePomodoroSettings: () => ({ data: mocked.settings }),
}))

vi.mock('../todos/hooks', () => ({
  useCreateSession: () => ({ mutateAsync: mocked.createSessionMutateAsync, isPending: false }),
  useUpdateTodo: () => ({
    mutate: vi.fn(),
    mutateAsync: mocked.updateTodoMutateAsync,
    isPending: false,
  }),
}))

vi.mock('react-hot-toast', () => ({
  toast: { success: mocked.toastSuccess, error: mocked.toastError },
}))

const TODO_ID = 'todo-dup'

function seedStopwatch(state: Partial<SingleTimerState>) {
  const base: SingleTimerState = {
    sessionSequenceSeed: null,
    sessionSequence: 0,
    activeSessionId: null,
    mode: 'stopwatch',
    settingsSnapshot: mocked.settings,
    phase: 'flow',
    status: 'paused',
    endAt: null,
    remainingMs: null,
    elapsedMs: 120_000,
    initialFocusMs: 0,
    startedAt: null,
    cycleCount: 0,
    flexiblePhase: 'focus',
    focusElapsedMs: 120_000,
    breakElapsedMs: 0,
    breakTargetMs: null,
    breakCompleted: false,
    focusStartedAt: null,
    breakStartedAt: null,
    breakSessionPendingUpdate: false,
    sessions: [],
    ...state,
  }
  useTimerStore.setState({ timers: { [TODO_ID]: base }, pendingAutoSessions: {} })
}

describe('완료 확인 모달 — 완료 진행 중 이중 집계 방지', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocked.createSessionMutateAsync.mockReset().mockResolvedValue(undefined)
    mocked.updateTodoMutateAsync.mockReset()
    mocked.toastSuccess.mockReset()
    mocked.toastError.mockReset()
  })

  afterEach(() => {
    useTimerStore.setState({ timers: {}, pendingAutoSessions: {} })
  })

  it('updateTodo 가 처리되는 동안 총 Flow 시간이 두 배로 표시되지 않는다', async () => {
    const user = userEvent.setup()

    // 2분(>= MIN_FLOW) 집중, 휴식 없음, 첫 세션 (initialFocusMs=0, sessions=[])
    seedStopwatch({ focusElapsedMs: 120_000, initialFocusMs: 0, sessions: [] })

    // updateTodo 를 수동으로 resolve — 그 사이 모달은 열린 채 재렌더된다.
    let resolveUpdateTodo: () => void = () => {}
    mocked.updateTodoMutateAsync.mockImplementation(
      () => new Promise<void>((resolve) => {
        resolveUpdateTodo = resolve
      }),
    )

    renderApp(
      <TimerFullScreen
        isOpen
        onClose={vi.fn()}
        todoId={TODO_ID}
        todoTitle="이중 집계 테스트"
        sessionFocusSeconds={0}
        sessionCount={0}
        initialMode="stopwatch"
        isDone={false}
      />,
    )

    await user.click(await screen.findByRole('button', { name: '완료' }))
    await user.click(screen.getByRole('button', { name: '확인' }))

    // 세션 POST(syncSessionsImmediately) 가 호출되면 completeStopwatch 가 진행되어
    // updateSessions 로 store 가 갱신된 상태 = 모달이 이중 집계를 보일 수 있는 시점.
    await waitFor(() => expect(mocked.createSessionMutateAsync).toHaveBeenCalled())

    // 실제 집중 시간은 2분. 완료 중에도 "4분"(두 배)이 떠서는 안 된다.
    expect(screen.queryByText('4분 0초')).not.toBeInTheDocument()
    expect(screen.getByText('2분 0초')).toBeInTheDocument()

    resolveUpdateTodo()
  })
})
