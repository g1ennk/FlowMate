import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import type { ApiError } from '../../api/http'
import {
  useCreateSession,
  useCreateTodo,
  useDeleteTodo,
  useScheduleReviewTodo,
  useUpdateTodo,
} from './hooks'
import type { Todo } from '../../api/types'
import { useTimerStore } from '../timer/timerStore'
import { usePomodoroSettings } from '../settings/hooks'
import { completeTaskFromTimer } from '../timer/completeHelpers'
import { applySessionAggregateDelta } from './sessionAggregateCache'
import { normalizeSessionId } from '../../lib/sessionId'
import { useNoteModal } from './useNoteModal'
import { useDatePickerActions } from './useDatePickerActions'
import { useTimerOpenState } from './useTimerOpenState'

function getErrorMessage(error: unknown, fallback: string) {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as ApiError).message
    if (typeof message === 'string' && message.trim().length > 0) {
      return message
    }
  }
  return fallback
}

/**
 * Todo CRUD 및 타이머 관련 핸들러를 제공하는 커스텀 훅
 */
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

  // 편집 상태
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')

  // 메모 상태 (extracted)
  const noteModal = useNoteModal()

  // 타이머 상태 (extracted)
  const timerOpen = useTimerOpenState()

  // 날짜 액션 상태 (extracted)
  const datePicker = useDatePickerActions()

  // 선택된 todo (더보기 메뉴용)
  const [selectedTodo, setSelectedTodo] = useState<Todo | null>(null)

  // === Todo CRUD ===
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
  }

  const handleDelete = (id: string) => {
    reset(id)
    deleteTodo.mutate(id)
    setSelectedTodo(null)
  }

  // === 편집 ===
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

  // === 메모 (delegate to useNoteModal, clear selectedTodo) ===
  const handleOpenNote = (todo: Todo) => {
    noteModal.handleOpenNote(todo)
    setSelectedTodo(null)
  }

  // === 타이머 (delegate to useTimerOpenState) ===
  const handleOpenTimer = (todo: Todo, currentMode: Parameters<typeof timerOpen.handleOpenTimer>[1]) => {
    timerOpen.handleOpenTimer(todo, currentMode, setSelectedTodo)
  }

  // === 날짜 액션 (delegate to useDatePickerActions, clear selectedTodo) ===
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
