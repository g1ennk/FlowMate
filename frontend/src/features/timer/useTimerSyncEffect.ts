import { useCallback, useEffect, useRef } from 'react'
import { useCreateSession } from '../todos/hooks'
import { useTimerStore } from './timerStore'
import type { PendingPomodoroSession, SessionRecord, SingleTimerState } from './timerTypes'
import { normalizeSessionId } from '../../lib/sessionId'

type RetryState = Record<string, { attempt: number; nextRetryAt: number }>
type SyncCursorEntry = { count: number; signatures: string[] }
type SyncCursor = Record<string, SyncCursorEntry>

type SyncState = {
  timers: Record<string, SingleTimerState>
  pendingAutoSessions: Record<string, PendingPomodoroSession[]>
}

const RETRY_BASE_MS = 1_000
const RETRY_MAX_MS = 60_000
const RESYNC_INTERVAL_MS = 1_000

function computeRetryDelayMs(attempt: number) {
  const exp = Math.max(0, attempt - 1)
  const base = RETRY_BASE_MS * 2 ** exp
  const capped = Math.min(RETRY_MAX_MS, base)
  const jitter = Math.floor(Math.random() * 300)
  return capped + jitter
}

function canRetry(retries: RetryState, key: string) {
  const entry = retries[key]
  if (!entry) return true
  return Date.now() >= entry.nextRetryAt
}

function markRetry(retries: RetryState, key: string) {
  const prevAttempt = retries[key]?.attempt ?? 0
  const attempt = prevAttempt + 1
  retries[key] = {
    attempt,
    nextRetryAt: Date.now() + computeRetryDelayMs(attempt),
  }
}

function clearRetry(retries: RetryState, key: string) {
  delete retries[key]
}

function cloneCursorEntry(entry?: SyncCursorEntry): SyncCursorEntry {
  return {
    count: entry?.count ?? 0,
    signatures: [...(entry?.signatures ?? [])],
  }
}

function isSameCursorEntry(left?: SyncCursorEntry, right?: SyncCursorEntry) {
  if (!left && !right) return true
  if (!left || !right) return false
  if (left.count !== right.count) return false
  if (left.signatures.length !== right.signatures.length) return false
  return left.signatures.every((value, index) => value === right.signatures[index])
}

function getSessionSignature(session: SessionRecord) {
  return `${normalizeSessionId(session.clientSessionId)}:${session.sessionFocusSeconds}:${session.breakSeconds}`
}

function findFirstSyncDiffIndex(sessions: SessionRecord[], entry: SyncCursorEntry) {
  const compareLimit = Math.min(entry.count, sessions.length)
  for (let index = 0; index < compareLimit; index += 1) {
    if (entry.signatures[index] !== getSessionSignature(sessions[index])) {
      return index
    }
  }

  if (sessions.length > compareLimit) {
    return compareLimit
  }

  return -1
}

export function useTimerSyncEffect() {
  const createSession = useCreateSession()
  const ackAutoSession = useTimerStore((s) => s.ackAutoSession)

  const cursorRef = useRef<SyncCursor | null>(null)
  const inFlightStopwatchRef = useRef(new Set<string>())
  const inFlightAutoRef = useRef(new Set<string>())
  const syncStopwatchTimersRef = useRef<(state: SyncState) => void>(() => {})
  const syncAutoCompletedRef = useRef<(state: SyncState) => void>(() => {})

  const stopwatchRetryRef = useRef<RetryState>({})
  const autoRetryRef = useRef<RetryState>({})

  const createSessionRef = useRef(createSession)
  const ackAutoSessionRef = useRef(ackAutoSession)

  useEffect(() => {
    createSessionRef.current = createSession
  }, [createSession])

  useEffect(() => {
    ackAutoSessionRef.current = ackAutoSession
  }, [ackAutoSession])

  const getCursor = useCallback(() => {
    if (!cursorRef.current) {
      cursorRef.current = {}
    }
    return cursorRef.current
  }, [])

  const setCursor = useCallback((next: SyncCursor) => {
    cursorRef.current = next
  }, [])

  const syncStopwatchSessions = useCallback(async (
    todoId: string,
    startIndex: number,
  ) => {
    if (inFlightStopwatchRef.current.has(todoId)) return
    if (!canRetry(stopwatchRetryRef.current, todoId)) return
    inFlightStopwatchRef.current.add(todoId)

    let cursor = { ...getCursor() }
    let entry = cloneCursorEntry(cursor[todoId])

    for (let i = startIndex; ; i += 1) {
      const latestTimer = useTimerStore.getState().timers[todoId]
      if (!latestTimer) break

      const latestSession = latestTimer.sessions?.[i]
      if (!latestSession) break

      const session = latestSession
      const signature = getSessionSignature(session)

      if (session.sessionFocusSeconds <= 0) {
        entry = {
          count: i + 1,
          signatures: [...entry.signatures],
        }
        entry.signatures[i] = signature
        cursor = { ...cursor, [todoId]: entry }
        setCursor(cursor)
        clearRetry(stopwatchRetryRef.current, todoId)
        continue
      }

      try {
        await createSessionRef.current.mutateAsync({
          todoId,
          body: {
            sessionFocusSeconds: session.sessionFocusSeconds,
            breakSeconds: session.breakSeconds,
            clientSessionId: normalizeSessionId(session.clientSessionId),
          },
        })
        entry = {
          count: i + 1,
          signatures: [...entry.signatures],
        }
        entry.signatures[i] = signature
        cursor = { ...cursor, [todoId]: entry }
        setCursor(cursor)
        clearRetry(stopwatchRetryRef.current, todoId)
      } catch (error) {
        console.error('[TimerSync] Failed to sync stopwatch session', {
          todoId,
          index: i,
          error,
        })
        markRetry(stopwatchRetryRef.current, todoId)
        break
      }
    }

    const latestCount = useTimerStore.getState().timers[todoId]?.sessions.length ?? 0
    if (entry.count > latestCount || entry.signatures.length > latestCount) {
      entry = {
        count: Math.min(entry.count, latestCount),
        signatures: entry.signatures.slice(0, latestCount),
      }
      cursor = { ...cursor, [todoId]: entry }
      setCursor(cursor)
    }

    inFlightStopwatchRef.current.delete(todoId)
    syncStopwatchTimersRef.current(useTimerStore.getState())
  }, [getCursor, setCursor])

  const syncStopwatchTimers = useCallback((state: SyncState) => {
    const next = { ...getCursor() }
    let changed = false

    for (const [todoId, timer] of Object.entries(state.timers)) {
      if (timer.mode !== 'stopwatch') continue

      const sessions = timer.sessions ?? []
      const prevEntry = next[todoId]
      let entry = cloneCursorEntry(prevEntry)

      if (entry.count > sessions.length) {
        entry = {
          count: sessions.length,
          signatures: entry.signatures.slice(0, sessions.length),
        }
        clearRetry(stopwatchRetryRef.current, todoId)
      } else if (entry.signatures.length > sessions.length) {
        entry = {
          count: entry.count,
          signatures: entry.signatures.slice(0, sessions.length),
        }
      }

      next[todoId] = entry
      if (!isSameCursorEntry(prevEntry, entry)) {
        changed = true
      }

      const startIndex = findFirstSyncDiffIndex(sessions, entry)
      if (startIndex === -1) continue
      if (inFlightStopwatchRef.current.has(todoId)) continue
      if (!canRetry(stopwatchRetryRef.current, todoId)) continue

      void syncStopwatchSessions(todoId, startIndex)
    }

    if (changed) setCursor(next)
  }, [getCursor, setCursor, syncStopwatchSessions])

  useEffect(() => {
    syncStopwatchTimersRef.current = syncStopwatchTimers
  }, [syncStopwatchTimers])

  const syncAutoCompletedTodo = useCallback(async (
    todoId: string,
    pending: PendingPomodoroSession,
  ) => {
    if (inFlightAutoRef.current.has(todoId)) return
    if (!canRetry(autoRetryRef.current, todoId)) return
    inFlightAutoRef.current.add(todoId)

    try {
      // reset/ack 이후 큐가 변경됐으면 오래된 스냅샷 전송을 중단한다.
      const latestPending = useTimerStore.getState().pendingAutoSessions[todoId]?.[0]
      if (!latestPending || latestPending !== pending) {
        clearRetry(autoRetryRef.current, todoId)
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
      clearRetry(autoRetryRef.current, todoId)
      ackAutoSessionRef.current(todoId)
    } catch (error) {
      console.error('[TimerSync] Failed to sync auto-completed session', {
        todoId,
        error,
      })
      markRetry(autoRetryRef.current, todoId)
    } finally {
      inFlightAutoRef.current.delete(todoId)
      syncAutoCompletedRef.current(useTimerStore.getState())
    }
  }, [])

  const syncAutoCompleted = useCallback((state: SyncState) => {
    const entries = Object.entries(state.pendingAutoSessions)
    if (entries.length === 0) return

    for (const [todoId, queue] of entries) {
      if (queue.length === 0) continue
      if (inFlightAutoRef.current.has(todoId)) continue
      if (!canRetry(autoRetryRef.current, todoId)) continue

      const nextPending = queue[0]
      if (nextPending.sessionFocusSeconds <= 0) {
        ackAutoSessionRef.current(todoId)
        continue
      }

      void syncAutoCompletedTodo(todoId, nextPending)
    }
  }, [syncAutoCompletedTodo])

  useEffect(() => {
    syncAutoCompletedRef.current = syncAutoCompleted
  }, [syncAutoCompleted])

  useEffect(() => {
    const snapshot = useTimerStore.getState()
    syncStopwatchTimers(snapshot)
    syncAutoCompleted(snapshot)
  }, [syncAutoCompleted, syncStopwatchTimers])

  useEffect(() => {
    const unsub = useTimerStore.subscribe((state) => {
      const snapshot: SyncState = {
        timers: state.timers,
        pendingAutoSessions: state.pendingAutoSessions,
      }
      syncStopwatchTimers(snapshot)
      syncAutoCompleted(snapshot)
    })

    return () => {
      unsub()
    }
  }, [syncAutoCompleted, syncStopwatchTimers])

  useEffect(() => {
    const resync = () => {
      const snapshot = useTimerStore.getState()
      const state: SyncState = {
        timers: snapshot.timers,
        pendingAutoSessions: snapshot.pendingAutoSessions,
      }
      syncStopwatchTimers(state)
      syncAutoCompleted(state)
    }

    const intervalId = window.setInterval(resync, RESYNC_INTERVAL_MS)
    window.addEventListener('online', resync)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('online', resync)
    }
  }, [syncAutoCompleted, syncStopwatchTimers])
}
