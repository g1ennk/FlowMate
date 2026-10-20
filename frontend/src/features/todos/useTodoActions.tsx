import { useState, useCallback, useRef } from 'react'
import { toast } from 'react-hot-toast'
import { UNDO_TOAST_POSITION, UndoToast } from '../../ui/UndoToast'
import type { Todo } from '../../api/types'
import {
  useCreateSession,
  useCreateTodo,
  useUpdateTodo,
} from './hooks'
import { useTimerStore } from '../timer/timerStore'
import { usePomodoroSettings } from '../settings/hooks'
import { postSessions, tryCompleteTaskFromTimer } from '../timer/completeHelpers'
import { normalizeSessionId } from '../../lib/sessionId'
import { useNoteModal } from './useNoteModal'
import { useDatePickerActions } from './useDatePickerActions'
import { useTimerOpenState } from './useTimerOpenState'
import { useDeleteWithUndo } from './useDeleteWithUndo'
import { FAILURE_TOAST_MS, toastMessages } from '../../lib/messages'
import { isOffline } from '../../lib/useOnlineStatus'

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
  const editingIdRef = useRef<string | null>(null)
  const editingOriginalTitleRef = useRef('')
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

  const handleToggleDone = async (
    id: string,
    title: string,
    next: boolean,
    nextOrder?: number,
    previousOrder?: number,
  ) => {
    if (next) {
      const timer = getTimer(id)
      if (timer && timer.status !== 'idle') {
        const result = await tryCompleteTaskFromTimer({
          todoId: id,
          timer,
          settings: settings ?? undefined,
          pause,
          reset,
          getTimer,
          syncSessionsImmediately: (sessions) =>
            postSessions(sessions, (session) =>
              createSession.mutateAsync({
                todoId: id,
                body: {
                  sessionFocusSeconds: session.sessionFocusSeconds,
                  breakSeconds: session.breakSeconds,
                  clientSessionId: normalizeSessionId(session.clientSessionId),
                },
              }),
            ),
          updateTodo: updateTodo.mutateAsync,
          nextOrder,
        })
        if (result !== 'completed') {
          toast.error(
            result === 'sessionSaveFailed' ? toastMessages.timerSessionSaveFailed : toastMessages.timerCompleteFailed,
            { id: 'timer-save-failed', duration: FAILURE_TOAST_MS },
          )
          return
        }

        toast.success(toastMessages.timerSaved, { id: 'timer-saved' })
        return
      }
    } else {
      const timer = getTimer(id)
      if (timer && timer.status === 'running') {
        pause(id)
      }
    }

    updateTodo.mutate(
      {
        id,
        patch: {
          isDone: next,
          ...(nextOrder === undefined ? {} : { dayOrder: nextOrder }),
        },
      },
      {
        // 저장하지 못하면 행은 롤백된다. 되돌리기 토스트("완료했어요")를 남기지 않고 실패를 알린다
        onError: () => {
          toast.dismiss(`toggle-${id}`)
          toast.error(toastMessages.todoUpdateFailed, { id: 'todo-update-failed' })
        },
      },
    )

    toast(
      (t) => (
        <UndoToast
          t={t}
          message={next ? toastMessages.todoCompleted(title) : toastMessages.todoUncompleted(title)}
          onUndo={() =>
            updateTodo.mutate({
              id,
              // 토글 전 순서도 되돌려야 원래 자리로 돌아간다.
              patch: {
                isDone: !next,
                ...(previousOrder === undefined ? {} : { dayOrder: previousOrder }),
              },
            })
          }
        />
      ),
      { id: `toggle-${id}`, duration: 3000, position: UNDO_TOAST_POSITION },
    )
  }

  const deleteWithUndo = useDeleteWithUndo()

  const handleDelete = useCallback((id: string, title: string) => {
    setSelectedTodo(null)
    deleteWithUndo([id], toastMessages.todoDeleted(title))
  }, [deleteWithUndo])

  const handleEdit = (id: string, currentTitle: string) => {
    editingIdRef.current = id
    editingOriginalTitleRef.current = currentTitle
    setEditingId(id)
    setEditingTitle(currentTitle)
    setSelectedTodo(null)
  }

  const handleCancelEdit = () => {
    editingIdRef.current = null
    setEditingId(null)
    setEditingTitle('')
  }

  // 저장은 편집을 바로 끝내고 진행한다. Enter 뒤 blur가 따라와도 ref가 비어 있어 한 번만 저장한다.
  // 비우거나 바꾸지 않았다면 원래 제목으로 편집만 끝낸다 (iPhone에는 Esc가 없다).
  // 오프라인이면 보내지 않고 고친 제목 그대로 편집을 이어 간다(연결된 뒤 말없이 저장되지 않게).
  const handleSaveEdit = async () => {
    const id = editingIdRef.current
    if (!id) return
    const title = editingTitle.trim()
    const unchanged = !title || title === editingOriginalTitleRef.current
    if (!unchanged && isOffline()) {
      toast.error(toastMessages.todoUpdateOffline, { id: 'todo-update-failed' })
      return
    }
    handleCancelEdit()
    if (unchanged) return

    try {
      await updateTodo.mutateAsync({ id, patch: { title } })
      toast.success(toastMessages.todoUpdated, { id: 'todo-updated' })
    } catch {
      toast.error(toastMessages.todoUpdateFailed, { id: 'todo-update-failed' })
    }
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
    showTimerError: timerOpen.showTimerError,
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
    handleCancelNoteEdit: noteModal.handleCancelNoteEdit,
    handleSaveNote: noteModal.handleSaveNote,
    handleDeleteNote: noteModal.handleDeleteNote,
    handleCloseNote: () => { void noteModal.handleCloseNote() },
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
