import type { PropsWithChildren } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestQueryClient } from '../../test/renderApp'
import { useTodoActions } from './useTodoActions'

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
    createTodoMutateAsync: vi.fn(),
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
  useCreateTodo: () => ({
    mutateAsync: mocked.createTodoMutateAsync,
    isPending: false,
  }),
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

vi.mock('./useNoteModal', () => ({
  useNoteModal: () => ({
    showNoteModal: false,
    noteText: '',
    setNoteText: vi.fn(),
    noteEditMode: false,
    noteTodo: null,
    handleOpenNote: vi.fn(),
    handleEditNote: vi.fn(),
    handleSaveNote: vi.fn(),
    handleDeleteNote: vi.fn(),
    handleCloseNote: vi.fn(),
  }),
}))

vi.mock('./useDatePickerActions', () => ({
  useDatePickerActions: () => ({
    datePickerOpen: false,
    datePickerMode: null,
    datePickerTodo: null,
    datePickerSelectedDate: '',
    setDatePickerSelectedDate: vi.fn(),
    closeDatePicker: vi.fn(),
    openMoveDatePicker: vi.fn(),
    openDuplicateDatePicker: vi.fn(),
    confirmDatePicker: vi.fn(),
    handleMoveTodoToToday: vi.fn(),
    handleMoveTodoToTomorrow: vi.fn(),
    handleDuplicateTodoToToday: vi.fn(),
    handleDuplicateTodoToTomorrow: vi.fn(),
  }),
}))

vi.mock('./useTimerOpenState', () => ({
  useTimerOpenState: () => ({
    timerTodo: null,
    timerMode: null,
    timerErrorMessage: null,
    setTimerErrorMessage: vi.fn(),
    handleOpenTimer: vi.fn(),
    handleCloseTimer: vi.fn(),
  }),
}))

function renderTodoActions() {
  const queryClient = createTestQueryClient()
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return renderHook(() => useTodoActions('2026-06-23'), { wrapper })
}

describe('useTodoActions timer completion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.getTimer.mockReturnValue(mocked.timer)
    mocked.createSessionMutateAsync.mockResolvedValue(undefined)
    mocked.updateTodoMutateAsync.mockResolvedValue(undefined)
  })

  it('keeps the todo and timer state when immediate session sync fails', async () => {
    mocked.createSessionMutateAsync.mockRejectedValueOnce(new Error('session sync failed'))
    const { result } = renderTodoActions()

    await act(async () => {
      await result.current.handleToggleDone('todo-1', true)
    })

    expect(mocked.toastError).toHaveBeenCalledWith(
      '타이머 저장에 실패했습니다. 다시 시도해주세요.',
      { id: 'timer-save-failed' },
    )
    expect(mocked.updateSessions).not.toHaveBeenCalled()
    expect(mocked.updateTodoMutateAsync).not.toHaveBeenCalled()
    expect(mocked.updateTodoMutate).not.toHaveBeenCalled()
    expect(mocked.reset).not.toHaveBeenCalled()
    expect(mocked.toastSuccess).not.toHaveBeenCalled()
  })

  it('completes and resets the todo after immediate session sync succeeds', async () => {
    const { result } = renderTodoActions()

    await act(async () => {
      await result.current.handleToggleDone('todo-1', true)
    })

    expect(mocked.createSessionMutateAsync).toHaveBeenCalledTimes(1)
    expect(mocked.updateTodoMutateAsync).toHaveBeenCalledWith({
      id: 'todo-1',
      patch: { isDone: true, timerMode: 'stopwatch' },
    })
    expect(mocked.reset).toHaveBeenCalledWith('todo-1')
    expect(mocked.toastSuccess).toHaveBeenCalledWith('타이머 저장 완료!', {
      id: 'timer-saved',
    })
    expect(mocked.toastError).not.toHaveBeenCalled()
  })
})
