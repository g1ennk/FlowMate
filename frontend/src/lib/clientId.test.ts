import { beforeEach, describe, expect, it } from 'vitest'
import { getClientId } from './clientId'
import { storageKeys } from './storageKeys'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

describe('getClientId', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns existing uuid client id', () => {
    const existing = '11111111-1111-4111-8111-111111111111'
    localStorage.setItem(storageKeys.clientId, existing)
    expect(getClientId()).toBe(existing)
  })

  it('creates and stores a new uuid client id', () => {
    const id = getClientId()
    expect(id).toMatch(UUID_RE)
    expect(localStorage.getItem(storageKeys.clientId)).toBe(id)
  })

  it('replaces invalid stored client id with uuid', () => {
    localStorage.setItem(storageKeys.clientId, 'legacy-non-uuid')
    const id = getClientId()
    expect(id).toMatch(UUID_RE)
    expect(localStorage.getItem(storageKeys.clientId)).toBe(id)
  })
})
