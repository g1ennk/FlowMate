import type { PropsWithChildren } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestQueryClient } from '../../test/renderApp'
import { useBatchSelect } from './useBatchSelect'

const mocked = vi.hoisted(() => {
  const timer = {
    mode: 'stopwatch' as const,
    phase: 'flow' as const,
    status: 'paused' as const,
    endAt: null,
    remainingMs: null,
    elapsedMs: 120_000,
    initialFocusMs: 0,
    startedAt: null,
    cycleCount: 0,
    settingsSnapshot: null,
    flexiblePhase: 'focus' as const,
    focusElapsedMs: 120_000,
    breakElapsedMs: 0,
    breakTargetMs: null,
    breakCompleted: false,
    focusStartedAt: null,
    breakStartedAt: null,
    breakSessionPendingUpdate: false,
    sessions: [],
  }

  return {
    timer,
    createSessionMutateAsync: vi.fn(),
    updateTodoMutate: vi.fn(),
    updateTodoMutateAsync: vi.fn(),
    deleteTodoMutate: vi.fn(),
    pause: vi.fn(),
    reset: vi.fn(),
    getTimer: vi.fn(() => timer),
    updateSessions: vi.fn(),
    clearPendingAutoSessions: vi.fn(),
    toast: vi.fn(),
    toastSuccess: vi.fn(),
    toastError: vi.fn(),
  }
})

vi.mock('./hooks', () => ({
  useCreateSession: () => ({ mutateAsync: mocked.createSessionMutateAsync }),
  useUpdateTodo: () => ({
    mutate: mocked.updateTodoMutate,
    mutateAsync: mocked.updateTodoMutateAsync,
  }),
  useDeleteTodo: () => ({ mutate: mocked.deleteTodoMutate }),
}))

vi.mock('../settings/hooks', () => ({
  usePomodoroSettings: () => ({ data: undefined }),
}))

vi.mock('../timer/timerStore', () => ({
  useTimerStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      pause: mocked.pause,
      reset: mocked.reset,
      getTimer: mocked.getTimer,
      updateSessions: mocked.updateSessions,
      clearPendingAutoSessions: mocked.clearPendingAutoSessions,
    }),
}))

vi.mock('react-hot-toast', () => ({
  toast: Object.assign(mocked.toast, {
    success: mocked.toastSuccess,
    error: mocked.toastError,
  }),
}))

function renderBatchSelect() {
  const queryClient = createTestQueryClient()
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return renderHook(() => useBatchSelect(), { wrapper })
}

async function selectTodo(result: ReturnType<typeof renderBatchSelect>['result']) {
  act(() => {
    result.current.enterSelectMode()
    result.current.toggleSelect('todo-1')
  })
  expect(result.current.selectMode).toBe(true)
  expect(result.current.selectedIds.has('todo-1')).toBe(true)
}

describe('useBatchSelect timer completion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.getTimer.mockReturnValue(mocked.timer)
    mocked.createSessionMutateAsync.mockResolvedValue(undefined)
    mocked.updateTodoMutateAsync.mockResolvedValue(undefined)
  })

  it('keeps selection, todo, and timer state when immediate session sync fails', async () => {
    mocked.createSessionMutateAsync.mockRejectedValueOnce(new Error('session sync failed'))
    const { result } = renderBatchSelect()
    await selectTodo(result)

    await act(async () => {
      await result.current.batchComplete()
    })

    expect(mocked.toastError).toHaveBeenCalledWith(
      '타이머 저장에 실패했습니다. 다시 시도해주세요.',
      { id: 'timer-save-failed' },
    )
    expect(result.current.selectMode).toBe(true)
    expect(result.current.selectedIds.has('todo-1')).toBe(true)
    expect(mocked.updateSessions).not.toHaveBeenCalled()
    expect(mocked.updateTodoMutateAsync).not.toHaveBeenCalled()
    expect(mocked.updateTodoMutate).not.toHaveBeenCalled()
    expect(mocked.reset).not.toHaveBeenCalled()
    expect(mocked.toastSuccess).not.toHaveBeenCalled()
  })

  it('completes selected todos and clears selection after session sync succeeds', async () => {
    const { result } = renderBatchSelect()
    await selectTodo(result)

    await act(async () => {
      await result.current.batchComplete()
    })

    expect(mocked.createSessionMutateAsync).toHaveBeenCalledTimes(1)
    expect(mocked.updateTodoMutateAsync).toHaveBeenCalledWith({
      id: 'todo-1',
      patch: { isDone: true, timerMode: 'stopwatch' },
    })
    expect(mocked.reset).toHaveBeenCalledWith('todo-1')
    expect(mocked.toastSuccess).toHaveBeenCalledWith('1개 완료 처리됨', {
      id: 'batch-complete',
    })
    expect(result.current.selectMode).toBe(false)
    expect(result.current.selectedIds.size).toBe(0)
    expect(mocked.toastError).not.toHaveBeenCalled()
  })
})
