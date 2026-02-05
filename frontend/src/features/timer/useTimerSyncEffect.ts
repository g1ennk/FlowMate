import { useCallback, useEffect, useRef } from 'react'
import { useCreateSession } from '../todos/hooks'
import { usePomodoroSettings } from '../settings/hooks'
import { useTimerStore } from './timerStore'
import { MINUTE_MS } from '../../lib/time'
import { readSyncCursor, writeSyncCursor } from './timerSyncService'
import type { SessionRecord, SingleTimerState } from './timerTypes'
import type { PomodoroSettings } from '../../api/types'

type SyncCursor = Record<string, number>

type SyncState = {
  timers: Record<string, SingleTimerState>
  autoCompletedTodos: Set<string>
}

export function useTimerSyncEffect() {
  const createSession = useCreateSession()
  const { data: settings } = usePomodoroSettings()
  const clearAutoCompleted = useTimerStore((s) => s.clearAutoCompleted)

  const cursorRef = useRef<SyncCursor | null>(null)
  const inFlightStopwatchRef = useRef(new Set<string>())
  const inFlightAutoRef = useRef(new Set<string>())
  const syncStopwatchTimersRef = useRef<(state: SyncState) => void>(() => {})

  const createSessionRef = useRef(createSession)
  const settingsRef = useRef<PomodoroSettings | undefined>(settings)
  const clearAutoCompletedRef = useRef(clearAutoCompleted)

  useEffect(() => {
    createSessionRef.current = createSession
  }, [createSession])

  useEffect(() => {
    settingsRef.current = settings
  }, [settings])

  useEffect(() => {
    clearAutoCompletedRef.current = clearAutoCompleted
  }, [clearAutoCompleted])

  const getCursor = useCallback(() => {
    if (!cursorRef.current) {
      cursorRef.current = readSyncCursor()
    }
    return cursorRef.current
  }, [])

  const setCursor = useCallback((next: SyncCursor) => {
    cursorRef.current = next
    writeSyncCursor(next)
  }, [])

  const seedCursorFromState = useCallback((state: SyncState) => {
    const next = { ...getCursor() }
    let changed = false
    for (const [todoId, timer] of Object.entries(state.timers)) {
      if (timer.mode !== 'stopwatch') continue
      if (next[todoId] !== undefined) continue
      const count = timer.sessions?.length ?? 0
      next[todoId] = count
      changed = true
    }
    if (changed) setCursor(next)
  }, [getCursor, setCursor])

  const syncStopwatchSessions = useCallback(async (
    todoId: string,
    sessionsSnapshot: SessionRecord[],
    startIndex: number,
  ) => {
    if (inFlightStopwatchRef.current.has(todoId)) return
    inFlightStopwatchRef.current.add(todoId)

    let cursor = { ...getCursor() }
    let synced = cursor[todoId] ?? startIndex

    for (let i = startIndex; i < sessionsSnapshot.length; i += 1) {
      const session = sessionsSnapshot[i]
      try {
        await createSessionRef.current.mutateAsync({
          todoId,
          body: {
            sessionFocusSeconds: session.sessionFocusSeconds,
            breakSeconds: session.breakSeconds,
          },
        })
        synced = i + 1
        cursor = { ...cursor, [todoId]: synced }
        setCursor(cursor)
      } catch {
        break
      }
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
      const count = sessions.length
      const synced = next[todoId]

      if (synced === undefined) {
        next[todoId] = count
        changed = true
        continue
      }

      if (count < synced) {
        next[todoId] = count
        changed = true
        continue
      }

      if (count === synced) continue
      if (inFlightStopwatchRef.current.has(todoId)) continue

      void syncStopwatchSessions(todoId, sessions, synced)
    }

    if (changed) setCursor(next)
  }, [getCursor, setCursor, syncStopwatchSessions])

  useEffect(() => {
    syncStopwatchTimersRef.current = syncStopwatchTimers
  }, [syncStopwatchTimers])

  const syncAutoCompletedTodo = useCallback(async (
    todoId: string,
    timer: SingleTimerState,
    currentSettings: PomodoroSettings,
  ) => {
    inFlightAutoRef.current.add(todoId)
    try {
      const snapshot = timer.settingsSnapshot ?? currentSettings
      const flowMin = snapshot?.flowMin ?? currentSettings.flowMin
      const plannedMs = flowMin * MINUTE_MS
      const sessionFocusSeconds = Math.round(plannedMs / 1000)
      if (sessionFocusSeconds > 0) {
        await createSessionRef.current.mutateAsync({
          todoId,
          body: { sessionFocusSeconds, breakSeconds: 0 },
        })
        clearAutoCompletedRef.current(todoId)
      }
    } catch {
      // keep autoCompletedTodos for retry
    } finally {
      inFlightAutoRef.current.delete(todoId)
    }
  }, [])

  const syncAutoCompleted = useCallback((state: SyncState) => {
    if (state.autoCompletedTodos.size === 0) return
    const currentSettings = settingsRef.current
    if (!currentSettings) return

    for (const todoId of state.autoCompletedTodos) {
      if (inFlightAutoRef.current.has(todoId)) continue
      const timer = state.timers[todoId]
      if (!timer || timer.mode !== 'pomodoro') continue
      void syncAutoCompletedTodo(todoId, timer, currentSettings)
    }
  }, [syncAutoCompletedTodo])

  useEffect(() => {
    seedCursorFromState(useTimerStore.getState())
    syncAutoCompleted(useTimerStore.getState())
  }, [seedCursorFromState, syncAutoCompleted])

  useEffect(() => {
    const unsub = useTimerStore.subscribe((state) => {
      const snapshot: SyncState = {
        timers: state.timers,
        autoCompletedTodos: state.autoCompletedTodos,
      }
      syncStopwatchTimers(snapshot)
      syncAutoCompleted(snapshot)
    })

    return () => {
      unsub()
    }
  }, [syncAutoCompleted, syncStopwatchTimers])

  useEffect(() => {
    if (!settings) return
    syncAutoCompleted(useTimerStore.getState())
  }, [settings, syncAutoCompleted])
}
