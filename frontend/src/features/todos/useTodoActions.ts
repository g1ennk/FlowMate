import { useState, useEffect } from 'react'
import { toast } from 'react-hot-toast'
import {
  useCreateTodo,
  useDeleteTodo,
  useUpdateTodo,
  useAddFocus,
  useCompleteTodo,
} from './hooks'
import type { Todo } from '../../api/types'
import { useTimerStore } from '../timer/timerStore'
import { MINUTE_MS } from '../../lib/time'
import { usePomodoroSettings } from '../settings/hooks'

/**
 * Todo CRUD 및 타이머 관련 핸들러를 제공하는 커스텀 훅
 */
export function useTodoActions(selectedDateKey: string) {
  const createTodo = useCreateTodo()
  const updateTodo = useUpdateTodo()
  const deleteTodo = useDeleteTodo()
  const addFocus = useAddFocus()
  const completeTodo = useCompleteTodo()
  
  const { data: settings } = usePomodoroSettings()
  
  // 타이머 store
  const stop = useTimerStore((s) => s.stop)
  const pause = useTimerStore((s) => s.pause)
  const getTimer = useTimerStore((s) => s.getTimer)

  // 편집 상태
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')

  // 메모 상태
  const [selectedTodo, setSelectedTodo] = useState<Todo | null>(null)
  const [showNoteModal, setShowNoteModal] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [noteEditMode, setNoteEditMode] = useState(false) // 읽기/편집 모드
  const [noteTodo, setNoteTodo] = useState<Todo | null>(null) // 메모 관련 todo

  // 타이머 풀스크린 상태
  const [timerTodo, setTimerTodo] = useState<Todo | null>(null)
  const [timerMode, setTimerMode] = useState<'stopwatch' | 'pomodoro' | null>(null)

  // 타이머 에러 메시지 (BottomSheet 내부에 표시)
  const [timerErrorMessage, setTimerErrorMessage] = useState<string | null>(null)

  // === Todo CRUD ===
  const handleCreate = async (title: string) => {
    await createTodo.mutateAsync({ title, note: null, date: selectedDateKey })
  }

  const handleToggleDone = async (id: string, next: boolean) => {
    // 완료로 변경하는 경우, 타이머가 실행 중이면 시간 저장
    if (next) {
      const timer = getTimer(id)
      if (timer && timer.status !== 'idle') {
        // 타이머 일시정지
        if (timer.status === 'running') {
          pause(id)
        }
        
        // 시간 기록
        if (timer.mode === 'stopwatch') {
          // 일반 타이머: 추가된 시간만 계산
          const additionalMs = timer.elapsedMs - timer.initialFocusMs
          const additionalSec = Math.round(additionalMs / 1000)
          
          if (additionalSec > 0) {
            await addFocus.mutateAsync({ id, body: { durationSec: additionalSec } })
          }
        } else if (timer.mode === 'pomodoro') {
          // 뽀모도로: Flow phase에서만 시간 기록
          if (timer.phase === 'flow') {
            const snapshot = timer.settingsSnapshot ?? settings
            const plannedMs = snapshot ? snapshot.flowMin * MINUTE_MS : 25 * MINUTE_MS
            const remaining = timer.remainingMs ?? (timer.endAt ? Math.max(0, timer.endAt - Date.now()) : 0)
            const elapsedSec = Math.round((plannedMs - remaining) / 1000)
            
            if (elapsedSec > 0) {
              // 타이머가 거의 완료되었으면 (남은 시간 < 5초) 횟수 증가
              if (remaining < 5000) {
                await completeTodo.mutateAsync({ id, body: { durationSec: elapsedSec } })
              } else {
                // 중간에 완료하면 시간만 기록
                await addFocus.mutateAsync({ id, body: { durationSec: elapsedSec } })
              }
            }
          }
        }
        
        // 타이머 정리
        stop(id)
        toast.success('타이머 저장 완료!')
      }
    }
    
    // 완료 상태 변경
    updateTodo.mutate({ id, patch: { isDone: next } })
  }

  const handleDelete = (id: string) => {
    // 타이머가 실행 중이면 정리
    stop(id)
    // Todo 삭제
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
    setNoteTodo(todo)
    setNoteText(todo.note ?? '')
    setNoteEditMode(false) // 읽기 전용으로 시작
    setShowNoteModal(true)
    setSelectedTodo(null) // 다른 모달 닫기
  }

  const handleEditNote = () => {
    setNoteEditMode(true)
  }

  const handleSaveNote = async () => {
    if (!noteTodo) return
    await updateTodo.mutateAsync({ id: noteTodo.id, patch: { note: noteText || null } })
    setShowNoteModal(false)
    setNoteTodo(null)
    setNoteEditMode(false)
    toast.success('메모 저장됨')
  }

  const handleDeleteNote = async () => {
    if (!noteTodo) return
    await updateTodo.mutateAsync({ id: noteTodo.id, patch: { note: null } })
    setShowNoteModal(false)
    setNoteTodo(null)
    setNoteEditMode(false)
    toast.success('메모 삭제됨')
  }

  const handleCloseNote = () => {
    setShowNoteModal(false)
    setNoteTodo(null)
    setNoteEditMode(false)
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
    noteEditMode,
    noteTodo,

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
    handleEditNote,
    handleSaveNote,
    handleDeleteNote,
    handleCloseNote,
    handleOpenTimer,
    handleCloseTimer,
  }
}
