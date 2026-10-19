import { useState, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import { useCreateSession, useUpdateTodo } from './hooks'
import { useDeleteWithUndo } from './useDeleteWithUndo'
import { useTimerStore } from '../timer/timerStore'
import { usePomodoroSettings } from '../settings/hooks'
import { completeTaskFromTimer } from '../timer/completeHelpers'
import { normalizeSessionId } from '../../lib/sessionId'

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
    try {
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
            updateTodo: updateTodo.mutateAsync,
          })
        } else {
          updateTodo.mutate({ id, patch: { isDone: true } })
        }
      }
    } catch {
      toast.error('타이머 저장에 실패했습니다. 다시 시도해주세요.', {
        id: 'timer-save-failed',
      })
      return
    }

    toast.success(`${ids.length}개 완료 처리됨`, { id: 'batch-complete' })
    exitSelectMode()
  }, [selectedIds, settings, createSession, updateTodo, getTimer, pause, reset, exitSelectMode])

  const batchDelete = useCallback(() => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    deleteWithUndo(ids, `${ids.length}개 삭제됨`)
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
