import type { SingleTimerState, SessionRecord } from './timerTypes'
import { initialSingleTimerState } from './timerDefaults'
import { getClientId } from '../../lib/clientId'
import { storageKeys } from '../../lib/storageKeys'

export type PersistedTimerState = Omit<SingleTimerState, 'sessionHistory'>

type Persisted = PersistedTimerState

function getClientPrefixes() {
  const clientId = getClientId()
  return {
    clientId,
    timerPrefix: storageKeys.timerPrefix(clientId),
    sessionPrefix: storageKeys.sessionPrefix(clientId),
    legacyTimerPrefix: storageKeys.legacyTimerPrefix,
    legacySessionPrefix: storageKeys.legacySessionPrefix,
    legacyTimerClientPrefix: storageKeys.legacyTimerPrefixByClient(clientId),
    legacySessionClientPrefix: storageKeys.legacySessionPrefixByClient(clientId),
  }
}

// sessionHistory를 localStorage에 저장
export function saveSessionHistory(todoId: string, history: SessionRecord[]) {
  if (typeof window === 'undefined') return
  const { sessionPrefix } = getClientPrefixes()
  const key = sessionPrefix + todoId
  if (history.length === 0) {
    localStorage.removeItem(key)
    return
  }
  try {
    localStorage.setItem(key, JSON.stringify(history))
  } catch (e) {
    console.error('Failed to save sessionHistory to localStorage:', e)
  }
}

// sessionHistory를 localStorage에서 로드
export function loadSessionHistory(todoId: string): SessionRecord[] {
  if (typeof window === 'undefined') return []
  try {
    const { sessionPrefix, legacySessionPrefix, legacySessionClientPrefix } = getClientPrefixes()
    const key = sessionPrefix + todoId
    let raw = localStorage.getItem(key)
    if (!raw) {
      const legacyClientKey = legacySessionClientPrefix + todoId
      const legacyClientRaw = localStorage.getItem(legacyClientKey)
      if (legacyClientRaw) {
        localStorage.setItem(key, legacyClientRaw)
        localStorage.removeItem(legacyClientKey)
        raw = legacyClientRaw
      } else {
        const legacyKey = legacySessionPrefix + todoId
        const legacyRaw = localStorage.getItem(legacyKey)
        if (legacyRaw) {
          localStorage.setItem(key, legacyRaw)
          localStorage.removeItem(legacyKey)
          raw = legacyRaw
        }
      }
    }
    if (raw) {
      return JSON.parse(raw) as SessionRecord[]
    }
  } catch (e) {
    console.error('Failed to load sessionHistory from localStorage:', e)
  }
  return []
}

// 모든 sessionHistory 로드 (복원용)
function loadAllSessionHistory(): Record<string, SessionRecord[]> {
  if (typeof window === 'undefined') return {}
  const { sessionPrefix, legacySessionPrefix, legacySessionClientPrefix } = getClientPrefixes()
  const histories: Record<string, SessionRecord[]> = {}
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key) continue
      if (key.startsWith(sessionPrefix)) {
        const todoId = key.replace(sessionPrefix, '')
        const raw = localStorage.getItem(key)
        if (raw) {
          histories[todoId] = JSON.parse(raw) as SessionRecord[]
        }
      } else if (key.startsWith(legacySessionClientPrefix)) {
        const todoId = key.replace(legacySessionClientPrefix, '')
        const raw = localStorage.getItem(key)
        if (raw) {
          const nextKey = sessionPrefix + todoId
          localStorage.setItem(nextKey, raw)
          localStorage.removeItem(key)
          histories[todoId] = JSON.parse(raw) as SessionRecord[]
        }
      } else if (key.startsWith(legacySessionPrefix)) {
        const todoId = key.replace(legacySessionPrefix, '')
        const raw = localStorage.getItem(key)
        if (raw) {
          const nextKey = sessionPrefix + todoId
          localStorage.setItem(nextKey, raw)
          localStorage.removeItem(key)
          histories[todoId] = JSON.parse(raw) as SessionRecord[]
        }
      }
    }
  } catch (e) {
    console.error('Failed to load all sessionHistory:', e)
  }
  return histories
}

export function loadAllPersisted(): Record<string, SingleTimerState> {
  if (typeof window === 'undefined') return {}

  const timers: Record<string, SingleTimerState> = {}
  const { timerPrefix, legacyTimerPrefix, legacyTimerClientPrefix } = getClientPrefixes()
  const sessionHistories = loadAllSessionHistory()

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key) continue
      if (key.startsWith(timerPrefix)) {
        const todoId = key.replace(timerPrefix, '')
        const raw = localStorage.getItem(key)
        if (raw) {
          const persisted = JSON.parse(raw) as PersistedTimerState
          timers[todoId] = hydrateState(persisted, sessionHistories[todoId] ?? [])
        }
      } else if (key.startsWith(legacyTimerClientPrefix)) {
        const todoId = key.replace(legacyTimerClientPrefix, '')
        const raw = localStorage.getItem(key)
        if (raw) {
          const nextKey = timerPrefix + todoId
          localStorage.setItem(nextKey, raw)
          localStorage.removeItem(key)
          const persisted = JSON.parse(raw) as PersistedTimerState
          timers[todoId] = hydrateState(persisted, sessionHistories[todoId] ?? [])
        }
      } else if (key.startsWith(legacyTimerPrefix)) {
        const todoId = key.replace(legacyTimerPrefix, '')
        const raw = localStorage.getItem(key)
        if (raw) {
          const nextKey = timerPrefix + todoId
          localStorage.setItem(nextKey, raw)
          localStorage.removeItem(key)
          const persisted = JSON.parse(raw) as PersistedTimerState
          timers[todoId] = hydrateState(persisted, sessionHistories[todoId] ?? [])
        }
      }
    }

    // localStorage에 없는 타이머도 sessionHistory가 있으면 로드 (완료된 타이머)
    for (const [todoId, history] of Object.entries(sessionHistories)) {
      if (!timers[todoId] && history.length > 0) {
        timers[todoId] = {
          ...initialSingleTimerState,
          sessionHistory: history,
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

  const { sessionHistory, ...timerState } = state

  if (state.status === 'idle') {
    localStorage.removeItem(timerPrefix + todoId)
    return
  }

  localStorage.setItem(timerPrefix + todoId, JSON.stringify(timerState))
  saveSessionHistory(todoId, sessionHistory)
}

export function removePersisted(todoId: string) {
  if (typeof window === 'undefined') return
  const { timerPrefix } = getClientPrefixes()
  localStorage.removeItem(timerPrefix + todoId)
  saveSessionHistory(todoId, [])
}

function hydrateState(persisted: Persisted, sessionHistory: SessionRecord[] = []): SingleTimerState {
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
      return { ...initialSingleTimerState, sessionHistory }
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
    sessionHistory,
  }
}
