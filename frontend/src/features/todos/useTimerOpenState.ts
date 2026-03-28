import { useState, useEffect } from 'react'
import { toast } from 'react-hot-toast'
import { useUpdateTodo } from './hooks'
import type { Todo } from '../../api/types'
import { useTimerStore, type TimerMode } from '../timer/timerStore'
import { checkTimerConflict, getTimerConflictMessage } from '../timer/timerHelpers'

export function useTimerOpenState() {
  const updateTodo = useUpdateTodo()

  const getTimer = useTimerStore((s) => s.getTimer)

  const [timerTodo, setTimerTodo] = useState<Todo | null>(null)
  const [timerMode, setTimerMode] = useState<TimerMode | null>(null)
  const [timerErrorMessage, setTimerErrorMessage] = useState<string | null>(null)

  const handleOpenTimer = (todo: Todo, currentMode: TimerMode | null, setSelectedTodo: (todo: Todo | null) => void) => {
    if (todo.isDone) {
      toast.error('완료된 태스크는 타이머를 시작할 수 없습니다', { id: 'completed-task-timer' })
      return
    }

    const [hasConflict, conflictMode] = checkTimerConflict(useTimerStore.getState().timers, todo.id)
    if (hasConflict && conflictMode) {
      toast.error(getTimerConflictMessage(conflictMode), { id: 'timer-already-running' })
      return
    }

    const timer = getTimer(todo.id)
    const modeToUse: TimerMode | null =
      currentMode || (timer && timer.status !== 'idle' ? timer.mode : null) || todo.timerMode || null

    if (modeToUse) {
      setTimerTodo(todo)
      setTimerMode(modeToUse)
      setSelectedTodo(null)
      if (currentMode && todo.timerMode !== currentMode) {
        updateTodo.mutate({ id: todo.id, patch: { timerMode: currentMode } })
      }
    } else {
      setSelectedTodo(todo)
    }
  }

  const handleCloseTimer = () => {
    setTimerTodo(null)
    setTimerMode(null)
  }

  useEffect(() => {
    if (timerErrorMessage) {
      const timer = setTimeout(() => {
        setTimerErrorMessage(null)
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [timerErrorMessage])

  return {
    timerTodo,
    timerMode,
    timerErrorMessage,
    setTimerErrorMessage,
    handleOpenTimer,
    handleCloseTimer,
  }
}
