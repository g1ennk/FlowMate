import { describe, expect, it } from 'vitest'
import { getJwtExpiryMs, shouldRefreshSseToken } from './sseAuth'

function createJwt(expSeconds: number) {
  const encode = (value: unknown) =>
    btoa(JSON.stringify(value))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '')

  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ exp: expSeconds })}.signature`
}

describe('sseAuth', () => {
  it('reads the expiration time from a JWT payload', () => {
    expect(getJwtExpiryMs(createJwt(1_800_000_000))).toBe(1_800_000_000_000)
  })

  it('returns null for malformed JWT payloads', () => {
    expect(getJwtExpiryMs('invalid-token')).toBeNull()
  })

  it('refreshes only when the token is near expiration', () => {
    const now = 1_800_000_000_000

    expect(shouldRefreshSseToken(createJwt((now + 10_000) / 1000), 0, now)).toBe(true)
    expect(shouldRefreshSseToken(createJwt((now + 60_000) / 1000), 0, now)).toBe(false)
  })

  it('does not refresh again while the cooldown is active', () => {
    const now = 1_800_000_000_000
    const token = createJwt((now + 5_000) / 1000)

    expect(shouldRefreshSseToken(token, now - 1_000, now)).toBe(false)
  })
})
