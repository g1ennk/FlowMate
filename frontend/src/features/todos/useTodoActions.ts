import { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import {
  useCreateSession,
  useCreateTodo,
  useDeleteTodo,
  useUpdateTodo,
} from './hooks'
import type { Todo } from '../../api/types'
import { useTimerStore, type TimerMode } from '../timer/timerStore'
import { usePomodoroSettings } from '../settings/hooks'
import { checkTimerConflict, getTimerConflictMessage } from '../timer/timerHelpers'
import { completeTaskFromTimer } from '../timer/completeHelpers'
import { applySessionAggregateDelta } from './sessionAggregateCache'
import { normalizeSessionId } from '../../lib/sessionId'

/**
 * Todo CRUD 및 타이머 관련 핸들러를 제공하는 커스텀 훅
 */
export function useTodoActions(selectedDateKey: string) {
  const queryClient = useQueryClient()
  const createSession = useCreateSession()
  const createTodo = useCreateTodo()
  const updateTodo = useUpdateTodo()
  const deleteTodo = useDeleteTodo()

  const { data: settings } = usePomodoroSettings()

  // 타이머 store
  const pause = useTimerStore((s) => s.pause)
  const reset = useTimerStore((s) => s.reset)
  const getTimer = useTimerStore((s) => s.getTimer)
  const timers = useTimerStore((s) => s.timers)
  const updateSessions = useTimerStore((s) => s.updateSessions)

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
    // 완료로 변경하는 경우, 타이머가 실행 중이면 시간 저장
    if (next) {
      const timer = getTimer(id)
      if (timer && timer.status !== 'idle') {
        await completeTaskFromTimer({
          todoId: id,
          timer,
          settings: settings ?? undefined,
          pause,
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
      // 미완료로 변경하는 경우, 타이머 상태는 유지 (일시정지 상태로)
      // reset을 호출하지 않아서 이전 기록(sessions, timerMode 등)이 유지됨
      const timer = getTimer(id)
      if (timer && timer.status === 'running') {
        // 실행 중이면 일시정지만
        pause(id)
      }
      // 타이머 상태는 유지 (다시 열 때 이전 기록이 보임)
    }

    // 완료 상태 변경
    updateTodo.mutate({
      id,
      patch: {
        isDone: next,
        ...(nextOrder === undefined ? {} : { dayOrder: nextOrder }),
      },
    })
  }

  const handleDelete = (id: string) => {
    // 타이머 상태 및 sessions 완전 삭제
    reset(id)
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

    // 우선순위(일관화): 사용자 선택(currentMode) > 실행/일시정지 중인 로컬 타이머 > DB(timerMode) > null
    const timer = getTimer(todo.id)
    const modeToUse: TimerMode | null =
      currentMode || (timer && timer.status !== 'idle' ? timer.mode : null) || todo.timerMode || null

    // 모드가 있으면 타이머 화면 열기
    if (modeToUse) {
      setTimerTodo(todo)
      setTimerMode(modeToUse)
      setSelectedTodo(null)
      // 사용자 선택에 의해 명시적으로 모드가 지정된 경우, DB(timerMode)도 동기화
      if (currentMode && todo.timerMode !== currentMode) {
        updateTodo.mutate({ id: todo.id, patch: { timerMode: currentMode } })
      }
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
