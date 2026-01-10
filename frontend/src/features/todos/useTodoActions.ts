import { useState, useEffect } from 'react'
import { toast } from 'react-hot-toast'
import {
  useCreateTodo,
  useDeleteTodo,
  useUpdateTodo,
} from './hooks'
import type { Todo } from '../../api/types'

/**
 * Todo CRUD 및 타이머 관련 핸들러를 제공하는 커스텀 훅
 */
export function useTodoActions(selectedDateKey: string) {
  const createTodo = useCreateTodo()
  const updateTodo = useUpdateTodo()
  const deleteTodo = useDeleteTodo()

  // 편집 상태
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')

  // 메모 상태
  const [selectedTodo, setSelectedTodo] = useState<Todo | null>(null)
  const [showNoteModal, setShowNoteModal] = useState(false)
  const [noteText, setNoteText] = useState('')

  // 타이머 풀스크린 상태
  const [timerTodo, setTimerTodo] = useState<Todo | null>(null)
  const [timerMode, setTimerMode] = useState<'stopwatch' | 'pomodoro' | null>(null)

  // 타이머 에러 메시지 (BottomSheet 내부에 표시)
  const [timerErrorMessage, setTimerErrorMessage] = useState<string | null>(null)

  // === Todo CRUD ===
  const handleCreate = async (title: string) => {
    await createTodo.mutateAsync({ title, note: null, date: selectedDateKey })
  }

  const handleToggleDone = (id: string, next: boolean) => {
    updateTodo.mutate({ id, patch: { isDone: next } })
  }

  const handleDelete = (id: string) => {
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
    toast.success('수정됨')
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setEditingTitle('')
  }

  // === 메모 ===
  const handleOpenNote = (todo: Todo) => {
    setNoteText(todo.note ?? '')
    setShowNoteModal(true)
  }

  const handleSaveNote = async () => {
    if (!selectedTodo) return
    await updateTodo.mutateAsync({ id: selectedTodo.id, patch: { note: noteText || null } })
    setShowNoteModal(false)
    setSelectedTodo(null)
    toast.success('메모 저장됨')
  }

  const handleCloseNote = () => {
    setShowNoteModal(false)
    setSelectedTodo(null)
  }

  // === 타이머 ===
  const handleOpenTimer = (todo: Todo, currentMode: 'stopwatch' | 'pomodoro' | null) => {
    // 현재 타이머가 진행 중이면 해당 모드로 열기
    if (currentMode) {
      setTimerTodo(todo)
      setTimerMode(currentMode)
      setSelectedTodo(null)
    } else {
      // 타이머가 진행 중이지 않으면 더보기 메뉴 열기
      setSelectedTodo(todo)
    }
  }

  const handleCloseTimer = () => {
    setTimerTodo(null)
    setTimerMode(null)
  }

  // Note: handleStopTimer와 handleCompleteTask는 TimerFullScreen에서 직접 처리됩니다.
  // 여기서는 제거되었습니다.

  // 타이머 에러 메시지 자동 숨김 (2초 후)
  useEffect(() => {
    if (timerErrorMessage) {
      const timer = setTimeout(() => {
        setTimerErrorMessage(null)
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [timerErrorMessage])

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
    showNoteModal,
    noteText,
    setNoteText,

    // 타이머 상태
    timerTodo,
    timerMode,
    timerErrorMessage,
    setTimerErrorMessage,

    // 핸들러
    handleCreate,
    handleToggleDone,
    handleDelete,
    handleEdit,
    handleSaveEdit,
    handleCancelEdit,
    handleOpenNote,
    handleSaveNote,
    handleCloseNote,
    handleOpenTimer,
    handleCloseTimer,
  }
}
