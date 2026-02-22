import { beforeEach, describe, expect, it } from 'vitest'
import { clearAuthMode, getAuthMode, setAuthMode } from './auth'
import { storageKeys } from './storageKeys'

describe('auth local storage helpers', () => {
  beforeEach(() => {
    clearAuthMode()
    localStorage.clear()
  })

  it('returns null when auth mode is not set', () => {
    expect(getAuthMode()).toBeNull()
  })

  it('stores and reads guest mode', () => {
    setAuthMode('guest')
    expect(getAuthMode()).toBe('guest')
    expect(localStorage.getItem(storageKeys.authMode)).toBe('guest')
  })

  it('ignores invalid stored value', () => {
    localStorage.setItem(storageKeys.authMode, 'legacy')
    expect(getAuthMode()).toBeNull()
  })

  it('clears auth mode', () => {
    setAuthMode('guest')
    clearAuthMode()
    expect(getAuthMode()).toBeNull()
  })
})
