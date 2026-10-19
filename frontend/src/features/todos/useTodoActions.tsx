import { useState, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import { UndoToast } from '../../ui/UndoToast'
import type { Todo } from '../../api/types'
import {
  useCreateSession,
  useCreateTodo,
  useUpdateTodo,
} from './hooks'
import { useTimerStore } from '../timer/timerStore'
import { usePomodoroSettings } from '../settings/hooks'
import { completeTaskFromTimer } from '../timer/completeHelpers'
import { normalizeSessionId } from '../../lib/sessionId'
import { useNoteModal } from './useNoteModal'
import { useDatePickerActions } from './useDatePickerActions'
import { useTimerOpenState } from './useTimerOpenState'
import { useDeleteWithUndo } from './useDeleteWithUndo'

export function useTodoActions(selectedDateKey: string) {
  const createSession = useCreateSession()
  const createTodo = useCreateTodo()
  const updateTodo = useUpdateTodo()

  const { data: settings } = usePomodoroSettings()

  const pause = useTimerStore((s) => s.pause)
  const reset = useTimerStore((s) => s.reset)
  const getTimer = useTimerStore((s) => s.getTimer)

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
        try {
          await completeTaskFromTimer({
            todoId: id,
            timer,
            settings: settings ?? undefined,
            pause,
            reset,
            getTimer,
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
            updateTodo: updateTodo.mutateAsync,
            nextOrder,
          })
        } catch {
          toast.error('타이머 저장에 실패했습니다. 다시 시도해주세요.', {
            id: 'timer-save-failed',
          })
          return
        }

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

  const deleteWithUndo = useDeleteWithUndo()

  const handleDelete = useCallback((id: string) => {
    setSelectedTodo(null)
    deleteWithUndo([id], '삭제됨')
  }, [deleteWithUndo])

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
    isNoteSaving: noteModal.isNoteSaving,

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
    handleMoveTodoToToday: async (todo: Todo) => {
      setSelectedTodo(null)
      await datePicker.handleMoveTodoToToday(todo)
    },
    handleMoveTodoToTomorrow: async (todo: Todo) => {
      setSelectedTodo(null)
      await datePicker.handleMoveTodoToTomorrow(todo)
    },
    handleDuplicateTodoToToday: async (todo: Todo) => {
      setSelectedTodo(null)
      await datePicker.handleDuplicateTodoToToday(todo)
    },
    handleDuplicateTodoToTomorrow: async (todo: Todo) => {
      setSelectedTodo(null)
      await datePicker.handleDuplicateTodoToTomorrow(todo)
    },
  }
}
