import { useState, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import { useCreateSession, useUpdateTodo } from './hooks'
import { useDeleteWithUndo } from './useDeleteWithUndo'
import { useTimerStore } from '../timer/timerStore'
import { usePomodoroSettings } from '../settings/hooks'
import { postSessions, tryCompleteTaskFromTimer } from '../timer/completeHelpers'
import { normalizeSessionId } from '../../lib/sessionId'
import { FAILURE_TOAST_MS, toastMessages } from '../../lib/messages'

export function useBatchSelect() {
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const updateTodo = useUpdateTodo()
  const deleteWithUndo = useDeleteWithUndo()
  const createSession = useCreateSession()
  const { data: settings } = usePomodoroSettings()
  const pause = useTimerStore((s) => s.pause)
  const reset = useTimerStore((s) => s.reset)
  const getTimer = useTimerStore((s) => s.getTimer)

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
    // 타이머가 없는 할 일도 저장이 끝난 뒤에 완료를 알린다(실패하면 행은 롤백되고 선택은 남는다)
    const plainSaves: Promise<unknown>[] = []
    for (const id of ids) {
      const timer = getTimer(id)
      if (timer && timer.status !== 'idle') {
        // 활성 timer 가 있으면 누적된 focus 를 flush 한 뒤 완료 처리.
        const result = await tryCompleteTaskFromTimer({
          todoId: id,
          timer,
          settings: settings ?? undefined,
          pause,
          reset,
          getTimer,
          syncSessionsImmediately: (sessions) =>
            postSessions(sessions, (session) =>
              createSession.mutateAsync({
                todoId: id,
                body: {
                  sessionFocusSeconds: session.sessionFocusSeconds,
                  breakSeconds: session.breakSeconds,
                  clientSessionId: normalizeSessionId(session.clientSessionId),
                },
              }),
            ),
          updateTodo: updateTodo.mutateAsync,
        })
        if (result !== 'completed') {
          await Promise.allSettled(plainSaves)
          toast.error(
            result === 'sessionSaveFailed' ? toastMessages.timerSessionSaveFailed : toastMessages.batchCompleteFailed,
            { id: 'timer-save-failed', duration: FAILURE_TOAST_MS },
          )
          return
        }
      } else {
        plainSaves.push(updateTodo.mutateAsync({ id, patch: { isDone: true } }))
      }
    }
    const saved = await Promise.allSettled(plainSaves)
    if (saved.some((item) => item.status === 'rejected')) {
      toast.error(toastMessages.batchCompleteFailed, { id: 'timer-save-failed', duration: FAILURE_TOAST_MS })
      return
    }

    toast.success(toastMessages.batchCompleted(ids.length), { id: 'batch-complete' })
    exitSelectMode()
  }, [selectedIds, settings, createSession, updateTodo, getTimer, pause, reset, exitSelectMode])

  const batchDelete = useCallback(() => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    deleteWithUndo(ids, toastMessages.todosDeleted(ids.length))
    exitSelectMode()
  }, [selectedIds, deleteWithUndo, exitSelectMode])

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
