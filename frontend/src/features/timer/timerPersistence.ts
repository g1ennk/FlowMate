import type { SingleTimerState, SessionRecord } from './timerTypes'
import { initialSingleTimerState } from './timerDefaults'
import { getClientId } from '../../lib/clientId'
import { storageKeys } from '../../lib/storageKeys'

export type PersistedTimerState = Omit<SingleTimerState, 'sessions'>

type Persisted = PersistedTimerState

function getClientPrefixes() {
  const clientId = getClientId()
  return {
    clientId,
    timerPrefix: storageKeys.timerPrefix(clientId),
    sessionsPrefix: storageKeys.sessionsPrefix(clientId),
  }
}

// sessions를 localStorage에 저장
export function saveSessions(todoId: string, sessions: SessionRecord[]) {
  if (typeof window === 'undefined') return
  const { sessionsPrefix } = getClientPrefixes()
  const key = sessionsPrefix + todoId
  if (sessions.length === 0) {
    localStorage.removeItem(key)
    return
  }
  try {
    localStorage.setItem(key, JSON.stringify(sessions))
  } catch (e) {
    console.error('Failed to save sessions to localStorage:', e)
  }
}

// sessions를 localStorage에서 로드
export function loadSessions(todoId: string): SessionRecord[] {
  if (typeof window === 'undefined') return []
  try {
    const { sessionsPrefix } = getClientPrefixes()
    const key = sessionsPrefix + todoId
    const raw = localStorage.getItem(key)
    if (raw) {
      return JSON.parse(raw) as SessionRecord[]
    }
  } catch (e) {
    console.error('Failed to load sessions from localStorage:', e)
  }
  return []
}

// 모든 sessions 로드 (복원용)
function loadAllSessions(): Record<string, SessionRecord[]> {
  if (typeof window === 'undefined') return {}
  const { sessionsPrefix } = getClientPrefixes()
  const sessionsByTodo: Record<string, SessionRecord[]> = {}
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i)
      if (!key) continue
      if (key.startsWith(sessionsPrefix)) {
        const todoId = key.replace(sessionsPrefix, '')
        const raw = localStorage.getItem(key)
        if (raw) {
          sessionsByTodo[todoId] = JSON.parse(raw) as SessionRecord[]
        }
      }
    }
  } catch (e) {
    console.error('Failed to load all sessions:', e)
  }
  return sessionsByTodo
}

export function loadAllPersisted(): Record<string, SingleTimerState> {
  if (typeof window === 'undefined') return {}

  const timers: Record<string, SingleTimerState> = {}
  const { timerPrefix } = getClientPrefixes()
  const sessionsByTodo = loadAllSessions()

  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i)
      if (!key) continue
      if (key.startsWith(timerPrefix)) {
        const todoId = key.replace(timerPrefix, '')
        const raw = localStorage.getItem(key)
        if (raw) {
          const persisted = JSON.parse(raw) as PersistedTimerState
          timers[todoId] = hydrateState(persisted, sessionsByTodo[todoId] ?? [])
        }
      }
    }

    // localStorage에 없는 타이머도 sessions가 있으면 로드 (완료된 타이머)
    for (const [todoId, sessions] of Object.entries(sessionsByTodo)) {
      if (!timers[todoId] && sessions.length > 0) {
        timers[todoId] = {
          ...initialSingleTimerState,
          sessions,
        }
      }
    }
  } catch {
    return {}
  }

  return timers
}

export function savePersisted(todoId: string, state: SingleTimerState) {
  if (typeof window === 'undefined') return
  const { timerPrefix } = getClientPrefixes()

  const { sessions, ...timerState } = state

  if (state.status === 'idle') {
    localStorage.removeItem(timerPrefix + todoId)
    return
  }

  localStorage.setItem(timerPrefix + todoId, JSON.stringify(timerState))
  saveSessions(todoId, sessions)
}

export function removePersisted(todoId: string) {
  if (typeof window === 'undefined') return
  const { timerPrefix } = getClientPrefixes()
  localStorage.removeItem(timerPrefix + todoId)
  saveSessions(todoId, [])
}

function hydrateState(persisted: Persisted, sessions: SessionRecord[] = []): SingleTimerState {
  const now = Date.now()
  let endAt = persisted.endAt
  let remainingMs = persisted.remainingMs
  let elapsedMs = persisted.elapsedMs ?? 0
  // Flexible timer 상태 복원
  let focusElapsedMs = persisted.focusElapsedMs ?? 0
  let breakElapsedMs = persisted.breakElapsedMs ?? 0
  let focusStartedAt = persisted.focusStartedAt ?? null
  let breakStartedAt = persisted.breakStartedAt ?? null

  if (persisted.mode === 'pomodoro' && persisted.status === 'running' && endAt) {
    const left = endAt - now
    if (left <= 0) {
      return { ...initialSingleTimerState, sessions }
    }
    remainingMs = left
  }

  if (persisted.status === 'paused' && endAt) {
    remainingMs = Math.max(0, endAt - now)
    endAt = null
  }

  if (persisted.mode === 'stopwatch') {
    const phase = persisted.flexiblePhase

    if (persisted.status === 'running') {
      if (phase === 'focus' && focusStartedAt) {
        const delta = now - focusStartedAt
        focusElapsedMs = persisted.focusElapsedMs + delta
        focusStartedAt = now
      }

      if ((phase === 'break_suggested' || phase === 'break_free') && breakStartedAt) {
        const delta = now - breakStartedAt
        breakElapsedMs = persisted.breakElapsedMs + delta
        breakStartedAt = now
      }
    }

    if (persisted.status === 'paused') {
      if (phase === 'focus' && focusStartedAt) {
        const delta = now - focusStartedAt
        focusElapsedMs = persisted.focusElapsedMs + delta
        focusStartedAt = null
      }

      if ((phase === 'break_suggested' || phase === 'break_free') && breakStartedAt) {
        const delta = now - breakStartedAt
        breakElapsedMs = persisted.breakElapsedMs + delta
        breakStartedAt = null
      }
    }
  }

  elapsedMs = persisted.elapsedMs ?? elapsedMs

  return {
    ...persisted,
    endAt,
    remainingMs,
    elapsedMs,
    focusElapsedMs,
    breakElapsedMs,
    focusStartedAt,
    breakStartedAt,
    sessions,
  }
}
