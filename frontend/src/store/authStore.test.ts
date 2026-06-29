import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getAuthMode, setAuthMode } from '../lib/auth'
import { storageKeys } from '../lib/storageKeys'
import { useAuthStore } from './authStore'

const initialAuthStore = useAuthStore.getState()
const originalFetch = globalThis.fetch

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('authStore refresh coordination', () => {
  beforeEach(() => {
    useAuthStore.setState(initialAuthStore, true)
    window.localStorage.clear()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    useAuthStore.setState(initialAuthStore, true)
    window.localStorage.clear()
  })

  it('coalesces concurrent member refresh calls into one network request', async () => {
    useAuthStore.setState({
      state: {
        type: 'member',
        accessToken: 'old-token',
        user: { id: 'user-1', email: null, nickname: 'Glenn' },
      },
      initialized: true,
    })

    let refreshCalls = 0
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/auth/refresh')) {
        refreshCalls += 1
        return jsonResponse({
          accessToken: 'new-token',
          user: { id: 'user-1', email: null, nickname: 'Glenn' },
        })
      }
      throw new Error(`unexpected fetch: ${String(input)}`)
    })

    await Promise.all([
      useAuthStore.getState().refresh(),
      useAuthStore.getState().refresh(),
    ])

    expect(refreshCalls).toBe(1)
    expect(useAuthStore.getState().state).toMatchObject({
      type: 'member',
      accessToken: 'new-token',
    })
  })

  it('clears member session without creating a guest session when member refresh fails', async () => {
    window.localStorage.setItem(storageKeys.guestToken, 'stale-guest-token')
    setAuthMode('member')
    useAuthStore.setState({
      state: {
        type: 'member',
        accessToken: 'expired-token',
        user: { id: 'user-1', email: null, nickname: 'Glenn' },
      },
      initialized: true,
    })

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/auth/refresh')) {
        return jsonResponse({ error: { message: 'Unauthorized' } }, { status: 401 })
      }
      if (String(input).endsWith('/auth/logout')) {
        return new Response(null, { status: 204 })
      }
      throw new Error(`unexpected fetch: ${String(input)}`)
    })

    await useAuthStore.getState().refresh()

    expect(useAuthStore.getState().state).toBeNull()
    expect(window.localStorage.getItem(storageKeys.guestToken)).toBeNull()
    expect(getAuthMode()).toBeNull()
  })

  it('does not let a stale member refresh failure clear a newer guest session', async () => {
    setAuthMode('member')
    useAuthStore.setState({
      state: {
        type: 'member',
        accessToken: 'expired-token',
        user: { id: 'user-1', email: null, nickname: 'Glenn' },
      },
      initialized: true,
    })

    let resolveRefresh!: (response: Response) => void
    const refreshResponse = new Promise<Response>((resolve) => {
      resolveRefresh = resolve
    })
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/auth/refresh')) {
        return refreshResponse
      }
      if (String(input).endsWith('/auth/guest/token')) {
        return jsonResponse({ guestToken: 'new-guest-token' })
      }
      if (String(input).endsWith('/auth/logout')) {
        return new Response(null, { status: 204 })
      }
      throw new Error(`unexpected fetch: ${String(input)}`)
    })
    globalThis.fetch = fetchMock

    const refreshPromise = useAuthStore.getState().refresh()
    await useAuthStore.getState().startGuest()

    resolveRefresh(jsonResponse({ error: { message: 'Unauthorized' } }, { status: 401 }))
    await refreshPromise

    expect(useAuthStore.getState().state).toEqual({ type: 'guest', token: 'new-guest-token' })
    expect(window.localStorage.getItem(storageKeys.guestToken)).toBe('new-guest-token')
    expect(getAuthMode()).toBe('guest')
  })

  it('does not auto-create a guest session when member init refresh fails', async () => {
    setAuthMode('member')
    window.localStorage.setItem(storageKeys.guestToken, 'stale-guest-token')

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/auth/refresh')) {
        return jsonResponse({ error: { message: 'Unauthorized' } }, { status: 401 })
      }
      if (String(input).endsWith('/auth/logout')) {
        return new Response(null, { status: 204 })
      }
      throw new Error(`unexpected fetch: ${String(input)}`)
    })

    await useAuthStore.getState().init()

    expect(useAuthStore.getState()).toMatchObject({
      initialized: true,
      state: null,
    })
    expect(window.localStorage.getItem(storageKeys.guestToken)).toBeNull()
    expect(globalThis.fetch).not.toHaveBeenCalledWith('/api/auth/guest/token', expect.anything())
  })

  it('restores member session when member init refresh succeeds', async () => {
    setAuthMode('member')

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/auth/refresh')) {
        return jsonResponse({
          accessToken: 'restored-access-token',
          user: { id: 'user-1', email: null, nickname: 'Glenn' },
        })
      }
      throw new Error(`unexpected fetch: ${String(input)}`)
    })

    await useAuthStore.getState().init()

    expect(useAuthStore.getState()).toMatchObject({
      initialized: true,
      state: {
        type: 'member',
        accessToken: 'restored-access-token',
        user: { id: 'user-1', email: null, nickname: 'Glenn' },
      },
    })
  })

  it('starts an explicit guest session on demand', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/auth/guest/token')) {
        return jsonResponse({ guestToken: 'guest-token' })
      }
      throw new Error(`unexpected fetch: ${String(input)}`)
    })

    await useAuthStore.getState().startGuest()

    expect(window.localStorage.getItem(storageKeys.guestToken)).toBe('guest-token')
    expect(getAuthMode()).toBe('guest')
    expect(useAuthStore.getState().state).toEqual({ type: 'guest', token: 'guest-token' })
  })
})
