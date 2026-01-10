import { useState, useEffect } from 'react'
import { toast } from 'react-hot-toast'
import { useTimerStore } from '../timer/timerStore'
import { usePomodoroSettings } from '../settings/hooks'
import { MINUTE_MS } from '../../lib/time'
import {
  useAddFocus,
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
  const completeTodo = useCompleteTodo() // 뽀모도로용 (횟수 + 시간)
  const addFocus = useAddFocus() // 일반 타이머용 (시간만)
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

  // 현재 phase의 계획된 시간(ms) 계산
  const getPlannedMs = () => {
    const snapshot = store.settingsSnapshot ?? settings
    if (!snapshot) return 25 * MINUTE_MS
    
    if (store.phase === 'flow') return snapshot.flowMin * MINUTE_MS
    if (store.phase === 'long') return snapshot.longBreakMin * MINUTE_MS
    return snapshot.breakMin * MINUTE_MS // 'short'
  }

  // 경과 시간 계산 헬퍼
  const calcElapsedSec = () => {
    const plannedMs = getPlannedMs()
    const remaining = store.remainingMs ?? (store.endAt ? Math.max(0, store.endAt - Date.now()) : 0)
    return Math.round((plannedMs - remaining) / 1000)
  }

  // 타이머 정지 (■) - 시간 기록 + 타이머 리셋 (태스크 미완료, 횟수 X)
  const handleStopTimer = async () => {
    if (!store.todoId) return
    const todoId = store.todoId
    
    // pause 먼저 호출 (정확한 시간 계산)
    store.pause()
    
    if (store.mode === 'stopwatch') {
      // 일반 타이머: 전체 시간 기록
      const elapsedSec = Math.round(store.elapsedMs / 1000)
      
      if (elapsedSec > 0) {
        const response = await addFocus.mutateAsync({ id: todoId, body: { durationSec: elapsedSec } })
        
        // 기록된 누적 시간으로 타이머 리셋 (pause 상태 유지)
        const newFocusMs = response.focusSeconds * 1000
        store.startStopwatch(todoId, newFocusMs)
        store.pause()
        
        toast.success('기록됨')
      }
    } else {
      // Pomodoro: Flow phase에서만 시간 기록 (횟수 증가 X)
      if (store.phase === 'flow') {
        const elapsedSec = calcElapsedSec()
        if (elapsedSec > 0) {
          await addFocus.mutateAsync({ id: todoId, body: { durationSec: elapsedSec } })
          toast.success('기록됨')
        }
      } else {
        // Break에서는 기록 없이 종료
        toast.success('타이머 종료')
      }
      // 뽀모도로는 완전 종료
      store.stop()
    }
  }

  // 태스크 완료 (✓) - 추가 시간만 기록 + 태스크 완료 + 타이머 종료
  const handleCompleteTask = async () => {
    if (!store.todoId) return
    const todoId = store.todoId
    
    // Flow가 아니면 완료 불가 (UI에서 버튼 비활성화되어야 하지만 fallback)
    if (store.mode === 'pomodoro' && store.phase !== 'flow') {
      toast.error('Flow 중에만 태스크를 완료할 수 있습니다')
      return
    }
    
    if (store.mode === 'stopwatch') {
      // 일반 타이머: 전체 시간 기록
      const elapsedSec = Math.round(store.elapsedMs / 1000)
      
      if (elapsedSec > 0) {
        await addFocus.mutateAsync({ id: todoId, body: { durationSec: elapsedSec } })
      }
    } else {
      // Pomodoro: Flow phase에서만 시간 기록
      if (store.phase === 'flow') {
        const elapsedSec = calcElapsedSec()
        const remaining = store.remainingMs ?? (store.endAt ? Math.max(0, store.endAt - Date.now()) : 0)
        
        if (elapsedSec > 0) {
          // 타이머가 거의 완료되었으면 (남은 시간 < 5초) 횟수 증가
          if (remaining < 5000) {
            await completeTodo.mutateAsync({ id: todoId, body: { durationSec: elapsedSec } })
          } else {
            // 중간에 완료하면 시간만 기록
            await addFocus.mutateAsync({ id: todoId, body: { durationSec: elapsedSec } })
          }
        }
      }
    }
    
    await updateTodo.mutateAsync({ id: todoId, patch: { isDone: true } })
    store.stop()
    toast.success('태스크 완료! 🎉')
  }

  // 타이머 에러 메시지 자동 숨김 (3초 후)
  useEffect(() => {
    if (timerErrorMessage) {
      const timer = setTimeout(() => {
        setTimerErrorMessage(null)
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [timerErrorMessage])

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
    handleStopTimer,
    handleCompleteTask,
  }
}
