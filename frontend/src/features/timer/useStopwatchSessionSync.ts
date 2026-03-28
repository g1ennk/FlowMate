import { useCallback, useEffect, useRef } from 'react'
import { useCreateSession } from '../todos/hooks'
import { useTimerStore } from './timerStore'
import type { SessionRecord, SingleTimerState } from './timerTypes'
import { normalizeSessionId } from '../../lib/sessionId'
import { type RetryState, canRetry, markRetry, clearRetry } from './timerSyncRetry'

type SyncCursorEntry = { count: number; signatures: string[] }
type SyncCursor = Record<string, SyncCursorEntry>

export type StopwatchSyncState = {
  timers: Record<string, SingleTimerState>
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

export function useStopwatchSessionSync() {
  const createSession = useCreateSession()

  const cursorRef = useRef<SyncCursor | null>(null)
  const inFlightRef = useRef(new Set<string>())
  const syncTimersRef = useRef<(state: StopwatchSyncState) => void>(() => {})
  const retryRef = useRef<RetryState>({})
  const createSessionRef = useRef(createSession)

  useEffect(() => {
    createSessionRef.current = createSession
  }, [createSession])

  const getCursor = useCallback(() => {
    if (!cursorRef.current) {
      cursorRef.current = {}
    }
    return cursorRef.current
  }, [])

  const setCursor = useCallback((next: SyncCursor) => {
    cursorRef.current = next
  }, [])

  const syncSessions = useCallback(async (
    todoId: string,
    startIndex: number,
  ) => {
    if (inFlightRef.current.has(todoId)) return
    if (!canRetry(retryRef.current, todoId)) return
    inFlightRef.current.add(todoId)

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
        clearRetry(retryRef.current, todoId)
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
        clearRetry(retryRef.current, todoId)
      } catch (error) {
        console.error('[TimerSync] Failed to sync stopwatch session', {
          todoId,
          index: i,
          error,
        })
        markRetry(retryRef.current, todoId)
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

    inFlightRef.current.delete(todoId)
    syncTimersRef.current(useTimerStore.getState())
  }, [getCursor, setCursor])

  const syncTimers = useCallback((state: StopwatchSyncState) => {
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
        clearRetry(retryRef.current, todoId)
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
      if (inFlightRef.current.has(todoId)) continue
      if (!canRetry(retryRef.current, todoId)) continue

      void syncSessions(todoId, startIndex)
    }

    if (changed) setCursor(next)
  }, [getCursor, setCursor, syncSessions])

  useEffect(() => {
    syncTimersRef.current = syncTimers
  }, [syncTimers])

  return syncTimers
}
