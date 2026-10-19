import { useCallback, useEffect, useRef } from 'react'
import { useCreateSession } from '../todos/hooks'
import { useTimerStore } from './timerStore'
import type { PendingPomodoroSession, SingleTimerState } from './timerTypes'
import { normalizeSessionId } from '../../lib/sessionId'
import { type RetryState, canRetry, markRetry, clearRetry, isPermanentSyncError } from './timerSyncRetry'

export type AutoSessionSyncState = {
  timers: Record<string, SingleTimerState>
  pendingAutoSessions: Record<string, PendingPomodoroSession[]>
}

export function usePomodoroAutoSessionSync() {
  const createSession = useCreateSession()
  const ackAutoSession = useTimerStore((s) => s.ackAutoSession)

  const inFlightRef = useRef(new Set<string>())
  const syncRef = useRef<(state: AutoSessionSyncState) => void>(() => {})
  const retryRef = useRef<RetryState>({})
  const createSessionRef = useRef(createSession)
  const ackAutoSessionRef = useRef(ackAutoSession)

  useEffect(() => {
    createSessionRef.current = createSession
  }, [createSession])

  useEffect(() => {
    ackAutoSessionRef.current = ackAutoSession
  }, [ackAutoSession])

  const syncTodo = useCallback(async (
    todoId: string,
    pending: PendingPomodoroSession,
  ) => {
    if (inFlightRef.current.has(todoId)) return
    if (!canRetry(retryRef.current, todoId)) return
    inFlightRef.current.add(todoId)

    try {
      const latestPending = useTimerStore.getState().pendingAutoSessions[todoId]?.[0]
      if (!latestPending || latestPending !== pending) {
        clearRetry(retryRef.current, todoId)
        return
      }

      await createSessionRef.current.mutateAsync({
        todoId,
        body: {
          sessionFocusSeconds: pending.sessionFocusSeconds,
          breakSeconds: pending.breakSeconds,
          clientSessionId: normalizeSessionId(pending.clientSessionId),
        },
      })
      clearRetry(retryRef.current, todoId)
      ackAutoSessionRef.current(todoId)
    } catch (error) {
      console.error('[TimerSync] Failed to sync auto-completed session', {
        todoId,
        error,
      })
      if (isPermanentSyncError(error)) {
        // 다시 보내도 같은 오류다. 버리고 같은 Todo의 다음 세션이 막히지 않게 한다.
        clearRetry(retryRef.current, todoId)
        ackAutoSessionRef.current(todoId)
      } else {
        markRetry(retryRef.current, todoId)
      }
    } finally {
      inFlightRef.current.delete(todoId)
      syncRef.current(useTimerStore.getState())
    }
  }, [])

  const syncAutoCompleted = useCallback((state: AutoSessionSyncState) => {
    const entries = Object.entries(state.pendingAutoSessions)
    if (entries.length === 0) return

    for (const [todoId, queue] of entries) {
      if (queue.length === 0) continue
      if (inFlightRef.current.has(todoId)) continue
      if (!canRetry(retryRef.current, todoId)) continue

      const nextPending = queue[0]
      if (nextPending.sessionFocusSeconds <= 0) {
        ackAutoSessionRef.current(todoId)
        continue
      }

      void syncTodo(todoId, nextPending)
    }
  }, [syncTodo])

  useEffect(() => {
    syncRef.current = syncAutoCompleted
  }, [syncAutoCompleted])

  return syncAutoCompleted
}
