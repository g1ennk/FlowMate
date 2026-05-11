import { useState, useCallback, useRef, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { UndoToast } from '../../ui/UndoToast'
import { useCreateSession, useDeleteTodo, useUpdateTodo } from './hooks'
import { useTimerStore } from '../timer/timerStore'
import { usePomodoroSettings } from '../settings/hooks'
import { completeTaskFromTimer } from '../timer/completeHelpers'
import { applySessionAggregateDelta } from './sessionAggregateCache'
import { normalizeSessionId } from '../../lib/sessionId'
import { queryKeys } from '../../lib/queryKeys'
import type { Todo, TodoList } from '../../api/types'

export function useBatchSelect() {
  const queryClient = useQueryClient()
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const updateTodo = useUpdateTodo()
  const deleteTodo = useDeleteTodo()
  const createSession = useCreateSession()
  const { data: settings } = usePomodoroSettings()
  const pause = useTimerStore((s) => s.pause)
  const reset = useTimerStore((s) => s.reset)
  const getTimer = useTimerStore((s) => s.getTimer)
  const updateSessions = useTimerStore((s) => s.updateSessions)
  const clearPendingAutoSessions = useTimerStore((s) => s.clearPendingAutoSessions)

  const deleteTodoRef = useRef(deleteTodo.mutate)
  useEffect(() => { deleteTodoRef.current = deleteTodo.mutate })

  const pendingBatchDelete = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingBatchIds = useRef<string[]>([])

  useEffect(() => {
    return () => {
      if (pendingBatchDelete.current) {
        clearTimeout(pendingBatchDelete.current)
        for (const id of pendingBatchIds.current) {
          deleteTodoRef.current(id)
        }
        pendingBatchDelete.current = null
        pendingBatchIds.current = []
      }
    }
  }, [])

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const exitSelectMode = useCallback(() => {
    setSelectMode(false)
    setSelectedIds(new Set())
  }, [])

  const enterSelectMode = useCallback(() => {
    setSelectMode(true)
    setSelectedIds(new Set())
  }, [])

  const batchComplete = useCallback(async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    for (const id of ids) {
      const timer = getTimer(id)
      if (timer && timer.status !== 'idle') {
        // 활성 timer 가 있으면 누적된 focus 를 flush 한 뒤 완료 처리.
        await completeTaskFromTimer({
          todoId: id,
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
        })
      } else {
        updateTodo.mutate({ id, patch: { isDone: true } })
      }
    }
    toast.success(`${ids.length}개 완료 처리됨`, { id: 'batch-complete' })
    exitSelectMode()
  }, [selectedIds, queryClient, settings, createSession, updateTodo, getTimer, pause, reset, updateSessions, exitSelectMode])

  const batchDelete = useCallback(() => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return

    const currentData = queryClient.getQueryData<TodoList>(queryKeys.todos())
    const deletedTodos = currentData?.items.filter((t: Todo) => ids.includes(t.id)) ?? []

    for (const id of ids) {
      reset(id)
      // 삭제되는 todo 의 미동기화 큐는 비운다 (POST /sessions 가 404 만 일으키므로).
      clearPendingAutoSessions(id)
    }
    queryClient.setQueryData<TodoList>(queryKeys.todos(), (old) => {
      if (!old) return old
      return { items: old.items.filter((t: Todo) => !ids.includes(t.id)) }
    })

    pendingBatchIds.current = ids
    pendingBatchDelete.current = setTimeout(() => {
      pendingBatchDelete.current = null
      for (const id of pendingBatchIds.current) {
        deleteTodoRef.current(id)
      }
      pendingBatchIds.current = []
    }, 5000)

    exitSelectMode()

    toast(
      (t) => (
        <UndoToast
          t={t}
          message={`${ids.length}개 삭제됨`}
          onUndo={() => {
            if (pendingBatchDelete.current) {
              clearTimeout(pendingBatchDelete.current)
              pendingBatchDelete.current = null
              pendingBatchIds.current = []
            }
            if (deletedTodos.length > 0) {
              queryClient.setQueryData<TodoList>(queryKeys.todos(), (old) => {
                if (!old) return { items: deletedTodos }
                return { items: [...old.items, ...deletedTodos] }
              })
            }
          }}
        />
      ),
      { id: 'batch-delete', duration: 5000 },
    )
  }, [selectedIds, queryClient, reset, clearPendingAutoSessions, exitSelectMode])

  return {
    selectMode,
    selectedIds,
    enterSelectMode,
    exitSelectMode,
    toggleSelect,
    batchComplete,
    batchDelete,
    selectedCount: selectedIds.size,
  }
}
