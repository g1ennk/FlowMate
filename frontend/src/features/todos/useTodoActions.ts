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
import { useTimerStore, type TimerMode } from '../timer/timerStore'
import { usePomodoroSettings } from '../settings/hooks'
import { checkTimerConflict, getTimerConflictMessage, getPlannedMs } from '../timer/timerHelpers'

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
  const timers = useTimerStore((s) => s.timers)

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
  const [timerMode, setTimerMode] = useState<TimerMode | null>(null)

  // 타이머 에러 메시지 (BottomSheet 내부에 표시)
  const [timerErrorMessage, setTimerErrorMessage] = useState<string | null>(null)

  // === Todo CRUD ===
  const handleCreate = async (title: string) => {
    await createTodo.mutateAsync({ title, note: null, date: selectedDateKey })
  }

  const handleToggleDone = async (id: string, next: boolean) => {
    // 완료로 변경하는 경우, 타이머가 실행 중이면 시간 저장
    if (next) {
      let timer = getTimer(id)
      if (timer && timer.status !== 'idle') {
        // 타이머 일시정지
        if (timer.status === 'running') {
          pause(id)
          // pause 후 업데이트된 타이머 값 다시 가져오기 (Zustand는 동기적으로 업데이트됨)
          const pausedTimer = getTimer(id)
          if (!pausedTimer) return // 방어 코드: pause 실패 시
          timer = pausedTimer
        }
        
        // 시간 기록
        if (timer.mode === 'stopwatch') {
          // 일반 타이머: focusElapsedMs 사용 (추가된 시간만 계산)
          const currentFocusMs = timer.focusElapsedMs ?? timer.elapsedMs
          const additionalMs = currentFocusMs - (timer.initialFocusMs ?? 0)
          const additionalSec = Math.round(additionalMs / 1000)
          
          if (additionalSec > 0) {
            await addFocus.mutateAsync({ id, body: { durationSec: additionalSec } })
          }
        } else if (timer.mode === 'pomodoro') {
          // 뽀모도로: Flow phase에서만 시간 기록
          if (timer.phase === 'flow') {
            const plannedMs = getPlannedMs(timer, settings)
            // pause된 상태이므로 remainingMs 사용
            const remaining = timer.remainingMs ?? plannedMs
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
        
        // timerMode 저장 (완료 전에 저장하여 이후 올바른 모드 표시)
        if (timer.mode) {
          await updateTodo.mutateAsync({ id, patch: { timerMode: timer.mode } })
        }
        
        // 타이머 정리 (sessionHistory 유지를 위해 stop 대신 pause만)
        // stop을 호출하면 status가 'idle'이 되지만 sessionHistory는 유지됨
        // 완료된 태스크의 sessionHistory를 보존하기 위해 stop 대신 pause 사용
        if (timer.status === 'running') {
          pause(id)
        }
        toast.success('타이머 저장 완료!', { id: 'timer-saved' })
      }
    } else {
      // 미완료로 변경하는 경우, 타이머 상태는 유지 (일시정지 상태로)
      // reset을 호출하지 않아서 이전 기록(sessionHistory, timerMode 등)이 유지됨
      const timer = getTimer(id)
      if (timer && timer.status === 'running') {
        // 실행 중이면 일시정지만
        pause(id)
      }
      // 타이머 상태는 유지 (다시 열 때 이전 기록이 보임)
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
    toast.success('수정됨', { id: 'todo-updated' })
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
    toast.success('메모 저장됨', { id: 'note-saved' })
  }

  const handleDeleteNote = async () => {
    if (!noteTodo) return
    await updateTodo.mutateAsync({ id: noteTodo.id, patch: { note: null } })
    setShowNoteModal(false)
    setNoteTodo(null)
    setNoteEditMode(false)
    toast.success('메모 삭제됨', { id: 'note-deleted' })
  }

  const handleCloseNote = () => {
    setShowNoteModal(false)
    setNoteTodo(null)
    setNoteEditMode(false)
  }

  // === 타이머 ===
  const handleOpenTimer = (todo: Todo, currentMode: TimerMode | null) => {
    // 완료된 태스크는 타이머를 열 수 없음
    if (todo.isDone) {
      toast.error('완료된 태스크는 타이머를 시작할 수 없습니다', { id: 'completed-task-timer' })
      return
    }
    
    // 다른 태스크에서 실행 중인 타이머가 있는지 체크
    const [hasConflict, conflictMode] = checkTimerConflict(timers, todo.id)
    if (hasConflict && conflictMode) {
      toast.error(getTimerConflictMessage(conflictMode), { id: 'timer-already-running' })
      return
    }
    
    // 우선순위: 현재 실행 중인 타이머 모드 > todo.timerMode > currentMode > null
    // reset 후에는 timer가 없으므로 todo.timerMode를 우선 사용 (미완료 처리 후 유지)
    const timer = getTimer(todo.id)
    // timer가 있으면 timer.mode 우선, 없으면 todo.timerMode 우선 (DB에 저장된 값)
    const modeToUse = timer?.mode || todo.timerMode || currentMode || null
    
    // 모드가 있으면 타이머 화면 열기
    if (modeToUse) {
      setTimerTodo(todo)
      setTimerMode(modeToUse)
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
