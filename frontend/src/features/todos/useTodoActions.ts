import { useState } from 'react'
import { toast } from 'react-hot-toast'
import { useTimerStore } from '../timer/timerStore'
import { usePomodoroSettings } from '../settings/hooks'
import { MINUTE_MS } from '../../lib/time'
import {
  useCompleteTodo,
  useCreateTodo,
  useDeleteTodo,
  useUpdateTodo,
} from './hooks'
import type { Todo } from '../../api/types'

/**
 * Todo CRUD 및 타이머 관련 핸들러를 제공하는 커스텀 훅
 */
export function useTodoActions(selectedDateKey: string) {
  const { data: settings } = usePomodoroSettings()
  const createTodo = useCreateTodo()
  const updateTodo = useUpdateTodo()
  const deleteTodo = useDeleteTodo()
  const completeTodo = useCompleteTodo()
  const store = useTimerStore()

  // 편집 상태
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')

  // 메모 상태
  const [selectedTodo, setSelectedTodo] = useState<Todo | null>(null)
  const [showNoteModal, setShowNoteModal] = useState(false)
  const [noteText, setNoteText] = useState('')

  // 타이머 풀스크린 상태
  const [timerTodo, setTimerTodo] = useState<Todo | null>(null)

  // === Todo CRUD ===
  const handleCreate = async (title: string) => {
    await createTodo.mutateAsync({ title, note: null, date: selectedDateKey })
    toast.success('추가됨')
  }

  const handleToggleDone = (id: string, next: boolean) => {
    updateTodo.mutate({ id, patch: { isDone: next } })
  }

  const handleDelete = (id: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return
    deleteTodo.mutate(id)
    toast.success('삭제됨')
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
  const handleOpenTimer = (todo: Todo) => {
    setTimerTodo(todo)
    setSelectedTodo(null)
  }

  const handleCloseTimer = () => {
    setTimerTodo(null)
  }

  // 경과 시간 계산 헬퍼
  const calcElapsedSec = () => {
    const snapshot = store.settingsSnapshot ?? settings
    const plannedMs = (snapshot?.flowMin ?? 25) * MINUTE_MS
    const remaining = store.remainingMs ?? (store.endAt ? store.endAt - Date.now() : 0)
    return Math.max(1, Math.round((plannedMs - remaining) / 1000))
  }

  // 타이머 정지 (■) - 세션 기록 + 타이머 종료 (태스크 미완료)
  const handleStopTimer = async () => {
    if (!store.todoId) return
    const todoId = store.todoId
    const elapsedSec = calcElapsedSec()
    await completeTodo.mutateAsync({ id: todoId, body: { durationSec: elapsedSec } })
    store.stop()
    toast.success('기록됨')
  }

  // 태스크 완료 (✓) - 세션 기록 + 태스크 완료 + 타이머 종료
  const handleCompleteTask = async () => {
    if (!store.todoId) return
    const todoId = store.todoId
    const elapsedSec = calcElapsedSec()
    await completeTodo.mutateAsync({ id: todoId, body: { durationSec: elapsedSec } })
    await updateTodo.mutateAsync({ id: todoId, patch: { isDone: true } })
    store.stop()
    toast.success('태스크 완료! 🎉')
  }

  return {
    // 뮤테이션 상태
    isCreating: createTodo.isPending,
    isCompleting: completeTodo.isPending,

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
    handleStopTimer,
    handleCompleteTask,
  }
}
