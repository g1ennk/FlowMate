import { beforeEach, describe, expect, it } from 'vitest'
import { loadAllPersisted, loadSessionHistory } from './timerPersistence'
import { initialSingleTimerState } from './timerDefaults'
import { storageKeys } from '../../lib/storageKeys'

const clientId = 'client-123'
const todoId = 'todo-1'
const history = [{ focusMs: 1000, breakMs: 0 }]

const seedClientId = () => {
  localStorage.setItem(storageKeys.clientId, clientId)
}

const seedPersistedState = () => {
  const { sessionHistory, ...persisted } = initialSingleTimerState
  void sessionHistory
  return persisted
}

describe('timerPersistence migration', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('migrates legacy sessionHistory without clientId', () => {
    seedClientId()
    const legacyKey = storageKeys.legacySessionPrefix + todoId
    localStorage.setItem(legacyKey, JSON.stringify(history))

    const loaded = loadSessionHistory(todoId)

    const newKey = storageKeys.sessionPrefix(clientId) + todoId
    expect(loaded).toEqual(history)
    expect(localStorage.getItem(newKey)).toBe(JSON.stringify(history))
    expect(localStorage.getItem(legacyKey)).toBeNull()
  })

  it('migrates legacy sessionHistory with clientId', () => {
    seedClientId()
    const legacyKey = storageKeys.legacySessionPrefixByClient(clientId) + todoId
    localStorage.setItem(legacyKey, JSON.stringify(history))

    const loaded = loadSessionHistory(todoId)

    const newKey = storageKeys.sessionPrefix(clientId) + todoId
    expect(loaded).toEqual(history)
    expect(localStorage.getItem(newKey)).toBe(JSON.stringify(history))
    expect(localStorage.getItem(legacyKey)).toBeNull()
  })

  it('migrates legacy timer state without clientId', () => {
    seedClientId()
    const persisted = seedPersistedState()
    const legacyKey = storageKeys.legacyTimerPrefix + todoId
    localStorage.setItem(legacyKey, JSON.stringify(persisted))

    const timers = loadAllPersisted()

    const newKey = storageKeys.timerPrefix(clientId) + todoId
    expect(timers[todoId]).toBeTruthy()
    expect(localStorage.getItem(newKey)).toBe(JSON.stringify(persisted))
    expect(localStorage.getItem(legacyKey)).toBeNull()
  })

  it('migrates legacy timer state with clientId', () => {
    seedClientId()
    const persisted = seedPersistedState()
    const legacyKey = storageKeys.legacyTimerPrefixByClient(clientId) + todoId
    localStorage.setItem(legacyKey, JSON.stringify(persisted))

    const timers = loadAllPersisted()

    const newKey = storageKeys.timerPrefix(clientId) + todoId
    expect(timers[todoId]).toBeTruthy()
    expect(localStorage.getItem(newKey)).toBe(JSON.stringify(persisted))
    expect(localStorage.getItem(legacyKey)).toBeNull()
  })
})
