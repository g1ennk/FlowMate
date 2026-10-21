import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import type { PomodoroSettings, TodoList } from '../../api/types'
import { useCreateSession, useUpdateTodo } from '../todos/hooks'
import { useTimerStore } from './timerStore'
import type { SingleTimerState } from './timerTypes'
import { postSessions, tryCompleteTaskFromTimer } from './completeHelpers'
import { getPlannedMs as getPlannedMsUtil } from './timerHelpers'
import { normalizeSessionId } from '../../lib/sessionId'
import { queryKeys } from '../../lib/queryKeys'
import { FAILURE_TOAST_MS, toastMessages } from '../../lib/messages'

type UseTimerCompletionParams = {
  todoId: string
  settings: PomodoroSettings | undefined
  onClose: () => void
}

export function useTimerCompletion({
  todoId,
  settings,
  onClose,
}: UseTimerCompletionParams) {
  const createSession = useCreateSession()
  const updateTodo = useUpdateTodo()
  const queryClient = useQueryClient()

  const pause = useTimerStore((s) => s.pause)
  const reset = useTimerStore((s) => s.reset)
  const getTimer = useTimerStore((s) => s.getTimer)
  const startBreak = useTimerStore((s) => s.startBreak)

  const getPlannedMs = useCallback(
    (timer: SingleTimerState | undefined) => getPlannedMsUtil(timer, settings),
    [settings],
  )

  const getNextDoneOrder = useCallback(() => {
    const data = queryClient.getQueryData<TodoList>(queryKeys.todos())
    if (!data) return undefined
    const current = data.items.find((item) => item.id === todoId)
    if (!current || current.isDone) return undefined
    const currentMiniDay = current.miniDay ?? 0
    const doneTodos = data.items.filter(
      (item) =>
        item.date === current.date &&
        item.isDone &&
        item.id !== todoId &&
        (item.miniDay ?? 0) === currentMiniDay,
    )
    const maxOrder =
      doneTodos.length === 0 ? -1 : Math.max(...doneTodos.map((item) => item.dayOrder ?? 0))
    return maxOrder + 1
  }, [queryClient, todoId])

  const handleComplete = useCallback(async () => {
    const timer = getTimer(todoId)
    if (!timer) return false

    const result = await tryCompleteTaskFromTimer({
      todoId,
      timer,
      settings: settings ?? undefined,
      pause,
      reset,
      getTimer,
      syncSessionsImmediately: (sessions) =>
        postSessions(sessions, (session) =>
          createSession.mutateAsync({
            todoId,
            body: {
              sessionFocusSeconds: session.sessionFocusSeconds,
              breakSeconds: session.breakSeconds,
              clientSessionId: normalizeSessionId(session.clientSessionId),
            },
          }),
        ),
      updateTodo: updateTodo.mutateAsync,
      nextOrder: getNextDoneOrder(),
      debug: timer.mode === 'stopwatch',
    })
    // 실패하면 성공 토스트를 띄우지 않는다. 확인 시트와 타이머가 그대로 남아 다시 누르면 다시 보낸다(멱등)
    if (result !== 'completed') {
      toast.error(
        result === 'sessionSaveFailed' ? toastMessages.timerSessionSaveFailed : toastMessages.timerCompleteFailed,
        { id: 'timer-save-failed', duration: FAILURE_TOAST_MS },
      )
      return false
    }

    toast.success(toastMessages.timerTodoCompleted, { id: 'task-completed' })
    onClose()
    return true
  }, [
    todoId,
    settings,
    pause,
    reset,
    getTimer,
    createSession,
    updateTodo,
    getNextDoneOrder,
    onClose,
  ])

  const handleStartBreak = useCallback(
    (targetMs: number | null) => {
      const timer = getTimer(todoId)
      if (!timer) return
      startBreak(todoId, targetMs)
    },
    [todoId, getTimer, startBreak],
  )

  return {
    handleComplete,
    handleStartBreak,
    getPlannedMs,
    updateTodoIsPending: updateTodo.isPending,
  }
}
