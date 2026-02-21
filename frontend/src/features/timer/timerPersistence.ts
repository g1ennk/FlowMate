import type { SingleTimerState } from './timerTypes'
import { initialSingleTimerState } from './timerDefaults'
import { getClientId } from '../../lib/clientId'
import { storageKeys } from '../../lib/storageKeys'

export type PersistedTimerState = Omit<SingleTimerState, 'sessions'>

type PersistedTimerEntry = PersistedTimerState & { updatedAt: number }

type PersistedTimers = {
  version: 1
  activeId: string | null
  items: Record<string, PersistedTimerEntry>
}

const TTL_MS = 7 * 24 * 60 * 60 * 1000
const MAX_ITEMS = 20

function createEmptyPersisted(): PersistedTimers {
  return { version: 1, activeId: null, items: {} }
}

function getClientKeys() {
  const clientId = getClientId()
  return {
    clientId,
    timersKey: storageKeys.timersKey(clientId),
  }
}

function getUpdatedAt(entry: { updatedAt?: number }) {
  return typeof entry.updatedAt === 'number' ? entry.updatedAt : 0
}

function clearLegacySessionStorage() {
  if (typeof window === 'undefined') return
  const { clientId } = getClientKeys()
  const itemPrefix = storageKeys.sessionsPrefix(clientId)
  const syncKey = storageKeys.sessionsSyncKey(clientId)
  const autoSyncKey = storageKeys.autoSessionsSyncKey(clientId)

  try {
    const legacyKeys: string[] = []
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      if (!key || !key.startsWith(itemPrefix)) continue
      if (key === syncKey || key === autoSyncKey) continue
      legacyKeys.push(key)
    }

    legacyKeys.forEach((key) => localStorage.removeItem(key))
  } catch (e) {
    console.error('Failed to clear legacy session cache from localStorage:', e)
  }
}

function readPersistedTimers(): PersistedTimers {
  if (typeof window === 'undefined') return createEmptyPersisted()
  clearLegacySessionStorage()
  const { timersKey } = getClientKeys()
  try {
    const raw = localStorage.getItem(timersKey)
    if (!raw) return createEmptyPersisted()
    const parsed = JSON.parse(raw) as Partial<PersistedTimers> | null
    if (!parsed || parsed.version !== 1) return createEmptyPersisted()

    const items = parsed.items && typeof parsed.items === 'object' ? parsed.items : {}
    const activeId = typeof parsed.activeId === 'string' ? parsed.activeId : null

    return {
      version: 1,
      activeId,
      items,
    }
  } catch (e) {
    console.error('Failed to load timers from localStorage:', e)
    return createEmptyPersisted()
  }
}

function writePersistedTimers(data: PersistedTimers) {
  if (typeof window === 'undefined') return
  const { timersKey } = getClientKeys()
  try {
    localStorage.setItem(timersKey, JSON.stringify(data))
  } catch (e) {
    console.error('Failed to save timers to localStorage:', e)
  }
}

function normalizeActiveId(data: PersistedTimers): PersistedTimers {
  const items = data.items
  let activeId = data.activeId

  if (activeId && (!items[activeId] || items[activeId].status !== 'running')) {
    activeId = null
  }

  if (!activeId) {
    const running = Object.entries(items).filter(([, entry]) => entry.status === 'running')
    if (running.length === 1) {
      activeId = running[0][0]
    } else if (running.length > 1) {
      running.sort((a, b) => getUpdatedAt(b[1]) - getUpdatedAt(a[1]))
      activeId = running[0][0]
    }
  }

  return { ...data, activeId }
}

function pruneTimers(data: PersistedTimers): PersistedTimers {
  const now = Date.now()
  const items: PersistedTimers['items'] = { ...data.items }

  for (const [todoId, entry] of Object.entries(items)) {
    if (entry.status === 'idle') {
      delete items[todoId]
      continue
    }

    const isPaused = entry.status === 'paused' || entry.status === 'waiting'
    const isStale = now - getUpdatedAt(entry) > TTL_MS
    if (isPaused && isStale && todoId !== data.activeId) {
      delete items[todoId]
    }
  }

  const ids = Object.keys(items)
  if (ids.length > MAX_ITEMS) {
    const sorted = ids.sort((a, b) => getUpdatedAt(items[b]) - getUpdatedAt(items[a]))
    const keep = new Set(sorted.slice(0, MAX_ITEMS))

    if (data.activeId && items[data.activeId] && !keep.has(data.activeId)) {
      keep.add(data.activeId)
      for (let i = sorted.length - 1; i >= 0 && keep.size > MAX_ITEMS; i -= 1) {
        const candidate = sorted[i]
        if (candidate !== data.activeId) {
          keep.delete(candidate)
        }
      }
    }

    for (const id of ids) {
      if (!keep.has(id)) delete items[id]
    }
  }

  return { ...data, items }
}

export function loadAllPersisted(): Record<string, SingleTimerState> {
  if (typeof window === 'undefined') return {}

  const timers: Record<string, SingleTimerState> = {}
  const persisted = readPersistedTimers()

  try {
    for (const [todoId, entry] of Object.entries(persisted.items)) {
      const { updatedAt: _updatedAt, ...timerState } = entry
      void _updatedAt
      timers[todoId] = hydrateState(timerState)
    }
  } catch {
    return {}
  }

  return timers
}

export function savePersisted(todoId: string, state: SingleTimerState) {
  if (typeof window === 'undefined') return

  const { sessions: _sessions, ...timerState } = state
  void _sessions
  const current = readPersistedTimers()

  if (state.status === 'idle') {
    delete current.items[todoId]
    if (current.activeId === todoId) current.activeId = null
  } else {
    current.items[todoId] = { ...timerState, updatedAt: Date.now() }
  }

  if (state.status === 'running') {
    current.activeId = todoId
  } else if (current.activeId === todoId) {
    current.activeId = null
  }

  const next = normalizeActiveId(pruneTimers(current))
  writePersistedTimers(next)
}

export function removePersisted(todoId: string) {
  if (typeof window === 'undefined') return

  const current = readPersistedTimers()
  delete current.items[todoId]
  if (current.activeId === todoId) current.activeId = null

  const next = normalizeActiveId(pruneTimers(current))
  writePersistedTimers(next)
}

function hydrateState(persisted: PersistedTimerState): SingleTimerState {
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
      return { ...initialSingleTimerState, sessions: [] }
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
    breakSessionPendingUpdate: persisted.breakSessionPendingUpdate ?? false,
    sessions: [],
  }
}
