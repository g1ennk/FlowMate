import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { checkHealth } from './health'

describe('checkHealth', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.useRealTimers()
  })

  it('200 응답이면 true를 반환한다', async () => {
    globalThis.fetch = vi.fn(async () => new Response('OK', { status: 200 }))
    await expect(checkHealth()).resolves.toBe(true)
  })

  it('500 응답이면 false를 반환한다', async () => {
    globalThis.fetch = vi.fn(async () => new Response('error', { status: 500 }))
    await expect(checkHealth()).resolves.toBe(false)
  })

  it('네트워크 에러가 나면 false를 반환한다', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    await expect(checkHealth()).resolves.toBe(false)
  })

  it('AbortError(타임아웃)가 나면 false를 반환한다', async () => {
    globalThis.fetch = vi.fn(async () => {
      const err = new Error('aborted')
      err.name = 'AbortError'
      throw err
    })
    await expect(checkHealth()).resolves.toBe(false)
  })
})
