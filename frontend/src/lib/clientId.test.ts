import { beforeEach, describe, expect, it } from 'vitest'
import { getClientId } from './clientId'
import { storageKeys } from './storageKeys'

describe('getClientId', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns existing client id', () => {
    localStorage.setItem(storageKeys.clientId, 'existing-id')
    expect(getClientId()).toBe('existing-id')
  })

  it('migrates legacy client id', () => {
    localStorage.setItem(storageKeys.legacyClientId, 'legacy-id')
    const id = getClientId()
    expect(id).toBe('legacy-id')
    expect(localStorage.getItem(storageKeys.clientId)).toBe('legacy-id')
    expect(localStorage.getItem(storageKeys.legacyClientId)).toBeNull()
  })

  it('creates and stores a new client id', () => {
    const id = getClientId()
    expect(id).toBeTruthy()
    expect(localStorage.getItem(storageKeys.clientId)).toBe(id)
  })
})
