import { useState } from 'react'
import { toast } from 'react-hot-toast'
import { useUpdateTodo } from './hooks'
import type { Todo } from '../../api/types'
import { useTimerStore, type TimerMode } from '../timer/timerStore'
import { checkTimerConflict, getTimerConflictMessage } from '../timer/timerHelpers'
import { toastMessages } from '../../lib/messages'

export function useTimerOpenState() {
  const updateTodo = useUpdateTodo()

  const getTimer = useTimerStore((s) => s.getTimer)

  const [timerTodo, setTimerTodo] = useState<Todo | null>(null)
  const [timerMode, setTimerMode] = useState<TimerMode | null>(null)

  const handleOpenTimer = (todo: Todo, currentMode: TimerMode | null, setSelectedTodo: (todo: Todo | null) => void) => {
    if (todo.isDone) {
      toast.error(toastMessages.completedTodoTimer, { id: 'completed-task-timer' })
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

  // 타이머를 열 수 없는 이유를 알린다. 메뉴 시트가 열려 있으면 토스트는 화면 위에 뜬다
  const showTimerError = (message: string) => {
    toast.error(message, { id: 'timer-disabled-reason' })
  }

  return {
    timerTodo,
    timerMode,
    showTimerError,
    handleOpenTimer,
    handleCloseTimer,
  }
}
