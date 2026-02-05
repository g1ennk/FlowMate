import { beforeEach, describe, expect, it } from 'vitest'
import { loadAllPersisted, loadSessions, savePersisted } from './timerPersistence'
import { initialSingleTimerState } from './timerDefaults'
import { storageKeys } from '../../lib/storageKeys'

const clientId = 'client-123'
const todoId = 'todo-1'
const sessions = [{ sessionFocusSeconds: 60, breakSeconds: 10 }]

const TTL_MS = 7 * 24 * 60 * 60 * 1000
const MAX_ITEMS = 20

const seedClientId = () => {
  localStorage.setItem(storageKeys.clientId, clientId)
}

const getPersistedBase = () => {
  const { sessions: _sessions, ...persisted } = initialSingleTimerState
  void _sessions
  return persisted
}

describe('timerPersistence', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('loads sessions for a todo', () => {
    seedClientId()
    const key = storageKeys.sessionsPrefix(clientId) + todoId
    localStorage.setItem(key, JSON.stringify(sessions))

    const loaded = loadSessions(todoId)

    expect(loaded).toEqual(sessions)
  })

  it('hydrates timer state with sessions when timer state exists', () => {
    seedClientId()
    const sessionsKey = storageKeys.sessionsPrefix(clientId) + todoId
    localStorage.setItem(sessionsKey, JSON.stringify(sessions))

    const persisted = {
      ...getPersistedBase(),
      status: 'paused',
      remainingMs: 60_000,
    }
    const timersKey = storageKeys.timersKey(clientId)
    localStorage.setItem(
      timersKey,
      JSON.stringify({
        version: 1,
        activeId: null,
        items: {
          [todoId]: { ...persisted, updatedAt: Date.now() },
        },
      }),
    )

    const timers = loadAllPersisted()

    expect(timers[todoId]?.sessions).toEqual(sessions)
  })

  it('does not create timer entry when only sessions exist', () => {
    seedClientId()
    const sessionsKey = storageKeys.sessionsPrefix(clientId) + todoId
    localStorage.setItem(sessionsKey, JSON.stringify(sessions))

    const timers = loadAllPersisted()

    expect(timers[todoId]).toBeUndefined()
  })

  it('prunes stale paused entries on save', () => {
    seedClientId()
    const staleId = 'todo-stale'
    const timersKey = storageKeys.timersKey(clientId)
    const staleUpdatedAt = Date.now() - TTL_MS - 1000

    const staleEntry = {
      ...getPersistedBase(),
      status: 'paused',
      remainingMs: 1000,
      updatedAt: staleUpdatedAt,
    }

    localStorage.setItem(
      timersKey,
      JSON.stringify({
        version: 1,
        activeId: null,
        items: {
          [staleId]: staleEntry,
        },
      }),
    )

    savePersisted(todoId, {
      ...initialSingleTimerState,
      status: 'paused',
      remainingMs: 1000,
      sessions: [],
    })

    const stored = JSON.parse(localStorage.getItem(timersKey) ?? '{}') as {
      items?: Record<string, unknown>
    }
    expect(stored.items?.[staleId]).toBeUndefined()
    expect(stored.items?.[todoId]).toBeDefined()
  })

  it('caps stored items and preserves active timer', () => {
    seedClientId()
    const timersKey = storageKeys.timersKey(clientId)
    const base = getPersistedBase()
    const now = Date.now()

    const items: Record<string, ReturnType<typeof getPersistedBase> & { updatedAt: number }> = {}
    for (let i = 0; i < MAX_ITEMS + 5; i += 1) {
      items[`todo-${i}`] = {
        ...base,
        status: 'paused',
        remainingMs: 1000,
        updatedAt: now - i * 1000,
      }
    }

    items['todo-active'] = {
      ...base,
      status: 'running',
      endAt: now + 60_000,
      updatedAt: now - (MAX_ITEMS + 10) * 1000,
    }

    localStorage.setItem(
      timersKey,
      JSON.stringify({
        version: 1,
        activeId: 'todo-active',
        items,
      }),
    )

    savePersisted('todo-new', {
      ...initialSingleTimerState,
      status: 'paused',
      remainingMs: 1000,
      sessions: [],
    })

    const stored = JSON.parse(localStorage.getItem(timersKey) ?? '{}') as {
      activeId?: string | null
      items?: Record<string, unknown>
    }

    const storedItems = stored.items ?? {}
    expect(Object.keys(storedItems).length).toBeLessThanOrEqual(MAX_ITEMS)
    expect(stored.activeId).toBe('todo-active')
    expect(storedItems['todo-active']).toBeDefined()
  })
})
