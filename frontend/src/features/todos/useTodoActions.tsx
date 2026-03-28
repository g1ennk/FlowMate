import { useState, useRef, useCallback, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { UndoToast } from '../../ui/UndoToast'
import { queryKeys } from '../../lib/queryKeys'
import type { Todo, TodoList } from '../../api/types'
import type { ApiError } from '../../api/http'
import {
  useCreateSession,
  useCreateTodo,
  useDeleteTodo,
  useScheduleReviewTodo,
  useUpdateTodo,
} from './hooks'
import { useTimerStore } from '../timer/timerStore'
import { usePomodoroSettings } from '../settings/hooks'
import { completeTaskFromTimer } from '../timer/completeHelpers'
import { applySessionAggregateDelta } from './sessionAggregateCache'
import { normalizeSessionId } from '../../lib/sessionId'
import { useNoteModal } from './useNoteModal'
import { useDatePickerActions } from './useDatePickerActions'
import { useTimerOpenState } from './useTimerOpenState'

function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as ApiError).message
    if (typeof message === 'string' && message.trim().length > 0) {
      return message
    }
  }
  return fallback
}

export function useTodoActions(selectedDateKey: string) {
  const queryClient = useQueryClient()
  const createSession = useCreateSession()
  const createTodo = useCreateTodo()
  const updateTodo = useUpdateTodo()
  const deleteTodo = useDeleteTodo()
  const scheduleReviewTodo = useScheduleReviewTodo()

  const { data: settings } = usePomodoroSettings()

  const pause = useTimerStore((s) => s.pause)
  const reset = useTimerStore((s) => s.reset)
  const getTimer = useTimerStore((s) => s.getTimer)
  const updateSessions = useTimerStore((s) => s.updateSessions)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const noteModal = useNoteModal()
  const timerOpen = useTimerOpenState()
  const datePicker = useDatePickerActions()
  const [selectedTodo, setSelectedTodo] = useState<Todo | null>(null)

  const handleCreate = async (title: string, miniDay: number = 0, dayOrder: number) => {
    await createTodo.mutateAsync({
      title,
      note: null,
      date: selectedDateKey,
      miniDay,
      dayOrder,
    })
  }

  const handleToggleDone = async (id: string, next: boolean, nextOrder?: number) => {
    if (next) {
      const timer = getTimer(id)
      if (timer && timer.status !== 'idle') {
        await completeTaskFromTimer({
          todoId: id,
          timer,
          settings: settings ?? undefined,
          pause,
          reset,
          getTimer,
          updateSessions,
          syncSessionsImmediately: async (sessions) => {
            for (const session of sessions) {
              if (session.sessionFocusSeconds <= 0) continue
              await createSession.mutateAsync({
                todoId: id,
                body: {
                  sessionFocusSeconds: session.sessionFocusSeconds,
                  breakSeconds: session.breakSeconds,
                  clientSessionId: normalizeSessionId(session.clientSessionId),
                },
              })
            }
          },
          applySessionAggregateDelta: (delta) => {
            applySessionAggregateDelta(queryClient, id, delta)
          },
          updateTodo: updateTodo.mutateAsync,
          nextOrder,
        })
        toast.success('타이머 저장 완료!', { id: 'timer-saved' })
        return
      }
    } else {
      const timer = getTimer(id)
      if (timer && timer.status === 'running') {
        pause(id)
      }
    }

    updateTodo.mutate({
      id,
      patch: {
        isDone: next,
        ...(nextOrder === undefined ? {} : { dayOrder: nextOrder }),
      },
    })

    toast(
      (t) => (
        <UndoToast
          t={t}
          message={next ? '완료!' : '완료 취소'}
          onUndo={() => updateTodo.mutate({ id, patch: { isDone: !next } })}
        />
      ),
      { id: `toggle-${id}`, duration: 3000 },
    )
  }

  const pendingDeleteTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const deleteTodoRef = useRef(deleteTodo.mutate)
  useEffect(() => { deleteTodoRef.current = deleteTodo.mutate })

  // 언마운트 시 pending delete 즉시 실행
  useEffect(() => {
    return () => {
      pendingDeleteTimers.current.forEach((timer, id) => {
        clearTimeout(timer)
        deleteTodoRef.current(id)
      })
      pendingDeleteTimers.current.clear()
    }
  }, [])

  const handleDelete = useCallback((id: string) => {
    // 이전 pending delete가 있으면 즉시 확정
    const existingTimer = pendingDeleteTimers.current.get(id)
    if (existingTimer) {
      clearTimeout(existingTimer)
      pendingDeleteTimers.current.delete(id)
    }

    reset(id)
    setSelectedTodo(null)

    // 삭제 대상 항목만 저장 (전체 스냅샷 대신)
    const currentData = queryClient.getQueryData<TodoList>(queryKeys.todos())
    const deletedTodo = currentData?.items.find((t) => t.id === id)

    // 캐시에서 optimistic 제거
    queryClient.setQueryData<TodoList>(queryKeys.todos(), (old) => {
      if (!old) return old
      return { items: old.items.filter((t) => t.id !== id) }
    })

    // 5초 후 실제 삭제
    const timer = setTimeout(() => {
      pendingDeleteTimers.current.delete(id)
      deleteTodoRef.current(id)
    }, 5000)
    pendingDeleteTimers.current.set(id, timer)

    toast(
      (t) => (
        <UndoToast
          t={t}
          message="삭제됨"
          onUndo={() => {
            const pending = pendingDeleteTimers.current.get(id)
            if (pending) {
              clearTimeout(pending)
              pendingDeleteTimers.current.delete(id)
            }
            if (deletedTodo) {
              queryClient.setQueryData<TodoList>(queryKeys.todos(), (old) => {
                if (!old) return { items: [deletedTodo] }
                return { items: [...old.items, deletedTodo] }
              })
            }
          }}
        />
      ),
      { id: `delete-${id}`, duration: 5000 },
    )
  }, [queryClient, reset])

  const handleEdit = (id: string, currentTitle: string) => {
    setEditingId(id)
    setEditingTitle(currentTitle)
    setSelectedTodo(null)
  }

  const handleSaveEdit = async () => {
    if (!editingId || !editingTitle.trim()) return
    await updateTodo.mutateAsync({ id: editingId, patch: { title: editingTitle.trim() } })
    setEditingId(null)
    setEditingTitle('')
    toast.success('수정됨', { id: 'todo-updated' })
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setEditingTitle('')
  }

  const handleOpenNote = (todo: Todo) => {
    noteModal.handleOpenNote(todo)
    setSelectedTodo(null)
  }

  const handleOpenTimer = (todo: Todo, currentMode: Parameters<typeof timerOpen.handleOpenTimer>[1]) => {
    timerOpen.handleOpenTimer(todo, currentMode, setSelectedTodo)
  }

  const openMoveDatePicker = (todo: Todo) => {
    setSelectedTodo(null)
    datePicker.openMoveDatePicker(todo)
  }

  const openDuplicateDatePicker = (todo: Todo) => {
    setSelectedTodo(null)
    datePicker.openDuplicateDatePicker(todo)
  }

  const handleScheduleReview = async (todo: Todo) => {
    setSelectedTodo(null)

    try {
      const result = await scheduleReviewTodo.mutateAsync({
        id: todo.id,
      })
      toast.success(
        result.created ? '다음 복습을 추가했어요' : '이미 다음 복습이 있어요',
        { id: 'todo-review-scheduled' },
      )
    } catch (error) {
      toast.error(getErrorMessage(error, '복습 추가에 실패했어요'), {
        id: 'todo-review-schedule-failed',
      })
    }
  }

  return {
    // 뮤테이션 상태
    isCreating: createTodo.isPending,

    // 편집 상태
    editingId,
    editingTitle,
    setEditingTitle,

    // 메모 상태
    selectedTodo,
    setSelectedTodo,
    showNoteModal: noteModal.showNoteModal,
    noteText: noteModal.noteText,
    setNoteText: noteModal.setNoteText,
    noteEditMode: noteModal.noteEditMode,
    noteTodo: noteModal.noteTodo,

    // 타이머 상태
    timerTodo: timerOpen.timerTodo,
    timerMode: timerOpen.timerMode,
    timerErrorMessage: timerOpen.timerErrorMessage,
    setTimerErrorMessage: timerOpen.setTimerErrorMessage,
    datePickerOpen: datePicker.datePickerOpen,
    datePickerMode: datePicker.datePickerMode,
    datePickerTodo: datePicker.datePickerTodo,
    datePickerSelectedDate: datePicker.datePickerSelectedDate,
    setDatePickerSelectedDate: datePicker.setDatePickerSelectedDate,

    // 핸들러
    handleCreate,
    handleToggleDone,
    handleDelete,
    handleEdit,
    handleSaveEdit,
    handleCancelEdit,
    handleOpenNote,
    handleEditNote: noteModal.handleEditNote,
    handleSaveNote: noteModal.handleSaveNote,
    handleDeleteNote: noteModal.handleDeleteNote,
    handleCloseNote: noteModal.handleCloseNote,
    handleOpenTimer,
    handleCloseTimer: timerOpen.handleCloseTimer,
    closeDatePicker: datePicker.closeDatePicker,
    openMoveDatePicker,
    openDuplicateDatePicker,
    confirmDatePicker: datePicker.confirmDatePicker,
    handleMoveTodoToToday: datePicker.handleMoveTodoToToday,
    handleMoveTodoToTomorrow: datePicker.handleMoveTodoToTomorrow,
    handleDuplicateTodoToToday: datePicker.handleDuplicateTodoToToday,
    handleDuplicateTodoToTomorrow: datePicker.handleDuplicateTodoToTomorrow,
    handleScheduleReview,
  }
}
