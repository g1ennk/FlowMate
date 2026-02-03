import { beforeEach, describe, expect, it } from 'vitest'
import { loadAllPersisted, loadSessions } from './timerPersistence'
import { initialSingleTimerState } from './timerDefaults'
import { storageKeys } from '../../lib/storageKeys'

const clientId = 'client-123'
const todoId = 'todo-1'
const sessions = [{ sessionFocusSeconds: 60, breakSeconds: 10 }]

const seedClientId = () => {
  localStorage.setItem(storageKeys.clientId, clientId)
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

    const { sessions: _sessions, ...persisted } = initialSingleTimerState
    void _sessions
    const timerKey = storageKeys.timerPrefix(clientId) + todoId
    localStorage.setItem(timerKey, JSON.stringify(persisted))

    const timers = loadAllPersisted()

    expect(timers[todoId]?.sessions).toEqual(sessions)
  })

  it('creates timer entry when only sessions exist', () => {
    seedClientId()
    const sessionsKey = storageKeys.sessionsPrefix(clientId) + todoId
    localStorage.setItem(sessionsKey, JSON.stringify(sessions))

    const timers = loadAllPersisted()

    expect(timers[todoId]?.sessions).toEqual(sessions)
  })
})
