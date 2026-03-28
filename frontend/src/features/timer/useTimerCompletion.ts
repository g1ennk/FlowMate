import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import type { PomodoroSettings, TodoList } from '../../api/types'
import { useCreateSession, useUpdateTodo } from '../todos/hooks'
import { useTimerStore } from './timerStore'
import type { SingleTimerState } from './timerTypes'
import { completeTaskFromTimer } from './completeHelpers'
import { getPlannedMs as getPlannedMsUtil } from './timerHelpers'
import { applySessionAggregateDelta } from '../todos/sessionAggregateCache'
import { normalizeSessionId } from '../../lib/sessionId'
import { queryKeys } from '../../lib/queryKeys'

type UseTimerCompletionParams = {
  todoId: string
  settings: PomodoroSettings | undefined
  endMusicSession: () => void
  onClose: () => void
}

export function useTimerCompletion({
  todoId,
  settings,
  endMusicSession,
  onClose,
}: UseTimerCompletionParams) {
  const createSession = useCreateSession()
  const updateTodo = useUpdateTodo()
  const queryClient = useQueryClient()

  const pause = useTimerStore((s) => s.pause)
  const reset = useTimerStore((s) => s.reset)
  const getTimer = useTimerStore((s) => s.getTimer)
  const updateSessions = useTimerStore((s) => s.updateSessions)
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
    if (!timer) return
    await completeTaskFromTimer({
      todoId,
      timer,
      settings: settings ?? undefined,
      pause,
      reset,
      getTimer,
      updateSessions,
      syncSessionsImmediately: async (sessions) => {
        for (const session of sessions) {
          if (session.sessionFocusSeconds <= 0) continue
          await createSession.mutateAsync({
            todoId,
            body: {
              sessionFocusSeconds: session.sessionFocusSeconds,
              breakSeconds: session.breakSeconds,
              clientSessionId: normalizeSessionId(session.clientSessionId),
            },
          })
        }
      },
      applySessionAggregateDelta: (delta) => {
        applySessionAggregateDelta(queryClient, todoId, delta)
      },
      updateTodo: updateTodo.mutateAsync,
      nextOrder: getNextDoneOrder(),
      debug: timer.mode === 'stopwatch',
    })
    toast.success('태스크 완료! 🎉', { id: 'task-completed' })
    endMusicSession()
    onClose()
  }, [
    todoId,
    settings,
    pause,
    reset,
    getTimer,
    updateSessions,
    createSession,
    updateTodo,
    queryClient,
    getNextDoneOrder,
    endMusicSession,
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
