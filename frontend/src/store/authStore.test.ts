import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getAuthMode, hasSessionExpired, markSessionExpired, setAuthMode } from '../lib/auth'
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

  it('clears local member session without calling logout when member refresh fails', async () => {
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

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/auth/refresh')) {
        return jsonResponse({ error: { message: 'Unauthorized' } }, { status: 401 })
      }
      if (String(input).endsWith('/auth/logout')) {
        throw new Error('refresh failure must not call logout')
      }
      throw new Error(`unexpected fetch: ${String(input)}`)
    })
    globalThis.fetch = fetchMock

    await useAuthStore.getState().refresh()

    const calledUrls = fetchMock.mock.calls.map(([input]) => String(input))

    expect(useAuthStore.getState().state).toBeNull()
    expect(window.localStorage.getItem(storageKeys.guestToken)).toBeNull()
    expect(getAuthMode()).toBeNull()
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/auth\/refresh$/),
      { method: 'POST', credentials: 'include' },
    )
    expect(calledUrls).toHaveLength(1)
    expect(calledUrls).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/\/auth\/logout$/)]),
    )
  })

  it('keeps explicit logout calling logout endpoint before starting guest session', async () => {
    setAuthMode('member')
    useAuthStore.setState({
      state: {
        type: 'member',
        accessToken: 'member-token',
        user: { id: 'user-1', email: null, nickname: 'Glenn' },
      },
      initialized: true,
    })

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/auth/logout')) {
        return new Response(null, { status: 204 })
      }
      if (String(input).endsWith('/auth/guest/token')) {
        return jsonResponse({ guestToken: 'guest-token-after-logout' })
      }
      throw new Error(`unexpected fetch: ${String(input)}`)
    })
    globalThis.fetch = fetchMock

    await useAuthStore.getState().logout()

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(/\/auth\/logout$/),
      { method: 'POST', credentials: 'include' },
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/\/auth\/guest\/token$/),
      { method: 'POST' },
    )
    expect(useAuthStore.getState().state).toEqual({
      type: 'guest',
      token: 'guest-token-after-logout',
    })
    expect(window.localStorage.getItem(storageKeys.guestToken)).toBe('guest-token-after-logout')
    expect(getAuthMode()).toBe('guest')
  })

  it('로그아웃하면 기기에 보관한 회고 글을 모두 지운다', async () => {
    useAuthStore.setState({
      state: {
        type: 'member',
        accessToken: 'member-token',
        user: { id: 'user-1', email: null, nickname: 'Glenn' },
      },
      initialized: true,
    })
    window.localStorage.setItem(storageKeys.reviewDraft('daily', '2026-10-19'), '{}')
    window.localStorage.setItem(storageKeys.reviewDraft('weekly', '2026-10-13'), '{}')
    window.localStorage.setItem(storageKeys.theme, 'dark')
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/auth/guest/token')) {
        return jsonResponse({ guestToken: 'guest-token-after-logout' })
      }
      return new Response(null, { status: 204 })
    })

    await useAuthStore.getState().logout()

    expect(window.localStorage.getItem(storageKeys.reviewDraft('daily', '2026-10-19'))).toBeNull()
    expect(window.localStorage.getItem(storageKeys.reviewDraft('weekly', '2026-10-13'))).toBeNull()
    expect(window.localStorage.getItem(storageKeys.theme)).toBe('dark')
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

const DAY_MS = 24 * 60 * 60 * 1000

function base64Url(value: unknown) {
  return btoa(JSON.stringify(value)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function fakeGuestJwt(expiresInMs: number, sub = 'client-1') {
  const exp = Math.floor((Date.now() + expiresInMs) / 1000)
  return `${base64Url({ alg: 'HS256' })}.${base64Url({ sub, role: 'guest', exp })}.signature`
}

describe('authStore guest renewal and session expiry', () => {
  beforeEach(() => {
    useAuthStore.setState(initialAuthStore, true)
    window.localStorage.clear()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    useAuthStore.setState(initialAuthStore, true)
    window.localStorage.clear()
  })

  it('renews a guest token close to expiry in the background without delaying init', async () => {
    const oldToken = fakeGuestJwt(10 * DAY_MS)
    window.localStorage.setItem(storageKeys.guestToken, oldToken)

    let resolveRenew!: (response: Response) => void
    globalThis.fetch = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveRenew = resolve
        }),
    )

    await useAuthStore.getState().init()

    expect(useAuthStore.getState()).toMatchObject({
      initialized: true,
      state: { type: 'guest', token: oldToken },
    })

    resolveRenew(jsonResponse({ guestToken: 'renewed-token' }))
    await vi.waitFor(() => {
      expect(useAuthStore.getState().state).toEqual({ type: 'guest', token: 'renewed-token' })
    })
  })

  it('renews an already expired guest token before finishing init, keeping the same identity', async () => {
    const oldToken = fakeGuestJwt(-DAY_MS)
    window.localStorage.setItem(storageKeys.guestToken, oldToken)
    setAuthMode('guest')

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/auth/guest/renew')) {
        return jsonResponse({ guestToken: 'renewed-token' })
      }
      throw new Error(`unexpected fetch: ${String(input)}`)
    })
    globalThis.fetch = fetchMock

    await useAuthStore.getState().init()

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/auth\/guest\/renew$/),
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ guestToken: oldToken }) }),
    )
    expect(useAuthStore.getState()).toMatchObject({
      initialized: true,
      state: { type: 'guest', token: 'renewed-token' },
    })
    expect(window.localStorage.getItem(storageKeys.guestToken)).toBe('renewed-token')
  })

  it('does not call the server on init when the guest token has plenty of time left', async () => {
    const token = fakeGuestJwt(60 * DAY_MS)
    window.localStorage.setItem(storageKeys.guestToken, token)
    const fetchMock = vi.fn()
    globalThis.fetch = fetchMock

    await useAuthStore.getState().init()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(useAuthStore.getState().state).toEqual({ type: 'guest', token })
  })

  it('renews instead of issuing a new guest identity when a guest request gets 401', async () => {
    const oldToken = fakeGuestJwt(-DAY_MS)
    useAuthStore.setState({ state: { type: 'guest', token: oldToken }, initialized: true })

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/auth/guest/renew')) {
        return jsonResponse({ guestToken: 'renewed-token' })
      }
      throw new Error(`unexpected fetch: ${String(input)}`)
    })
    globalThis.fetch = fetchMock

    await useAuthStore.getState().refresh()

    expect(useAuthStore.getState().state).toEqual({ type: 'guest', token: 'renewed-token' })
    expect(fetchMock.mock.calls.map(([input]) => String(input))).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/\/auth\/guest\/token$/)]),
    )
  })

  it('falls back to a new guest identity only when the server rejects the renewal', async () => {
    useAuthStore.setState({ state: { type: 'guest', token: 'ancient-token' }, initialized: true })

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/auth/guest/renew')) {
        return jsonResponse({ error: { message: 'Unauthorized' } }, { status: 401 })
      }
      if (String(input).endsWith('/auth/guest/token')) {
        return jsonResponse({ guestToken: 'brand-new-token' })
      }
      throw new Error(`unexpected fetch: ${String(input)}`)
    })

    await useAuthStore.getState().refresh()

    expect(useAuthStore.getState().state).toEqual({ type: 'guest', token: 'brand-new-token' })
  })

  it('keeps the guest identity when renewal fails with a server error', async () => {
    useAuthStore.setState({ state: { type: 'guest', token: 'old-token' }, initialized: true })

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/auth/guest/renew')) {
        return new Response('bad gateway', { status: 502 })
      }
      if (String(input).endsWith('/auth/guest/token')) {
        return jsonResponse({ guestToken: 'brand-new-token' })
      }
      throw new Error(`unexpected fetch: ${String(input)}`)
    })
    globalThis.fetch = fetchMock

    await expect(useAuthStore.getState().refresh()).rejects.toMatchObject({ status: 502 })

    expect(useAuthStore.getState().state).toEqual({ type: 'guest', token: 'old-token' })
    expect(fetchMock.mock.calls.map(([input]) => String(input))).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/\/auth\/guest\/token$/)]),
    )
  })

  it('keeps the member session when refresh fails with a server error', async () => {
    setAuthMode('member')
    const member = {
      type: 'member' as const,
      accessToken: 'expired-token',
      user: { id: 'user-1', email: null, nickname: 'Glenn' },
    }
    useAuthStore.setState({ state: member, initialized: true })

    globalThis.fetch = vi.fn(async () => new Response('bad gateway', { status: 502 }))

    await expect(useAuthStore.getState().refresh()).rejects.toMatchObject({ status: 502 })

    expect(useAuthStore.getState().state).toEqual(member)
    expect(getAuthMode()).toBe('member')
    expect(hasSessionExpired()).toBe(false)
  })

  it('leaves a session-expired hint when refresh is rejected', async () => {
    setAuthMode('member')
    useAuthStore.setState({
      state: {
        type: 'member',
        accessToken: 'expired-token',
        user: { id: 'user-1', email: null, nickname: 'Glenn' },
      },
      initialized: true,
    })

    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ error: { message: 'Unauthorized' } }, { status: 401 }),
    )

    await useAuthStore.getState().refresh()

    expect(useAuthStore.getState().state).toBeNull()
    expect(hasSessionExpired()).toBe(true)
  })

  it('does not silently start a new guest on reload after the member session expired', async () => {
    markSessionExpired()
    const fetchMock = vi.fn()
    globalThis.fetch = fetchMock

    await useAuthStore.getState().init()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(useAuthStore.getState()).toMatchObject({ initialized: true, state: null })
  })

  it('clears the session-expired hint after logging in again', async () => {
    markSessionExpired()
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({
        accessToken: 'access-token',
        user: { id: 'user-1', email: null, nickname: 'Glenn' },
      }),
    )

    await useAuthStore.getState().login('kakao', 'code', 'state')

    expect(hasSessionExpired()).toBe(false)
    expect(window.localStorage.getItem(storageKeys.guestStarted)).toBeNull()
  })

  it('clears the session-expired hint whenever a guest session starts', async () => {
    markSessionExpired()
    globalThis.fetch = vi.fn(async () => jsonResponse({ guestToken: 'guest-token' }))

    await useAuthStore.getState().startGuest()

    expect(hasSessionExpired()).toBe(false)
  })

  it('does not treat the guest session created by logout as a guest who used the app', async () => {
    window.localStorage.setItem(storageKeys.guestStarted, '1')
    setAuthMode('member')
    useAuthStore.setState({
      state: {
        type: 'member',
        accessToken: 'member-token',
        user: { id: 'user-1', email: null, nickname: 'Glenn' },
      },
      initialized: true,
    })
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith('/auth/logout')
        ? new Response(null, { status: 204 })
        : jsonResponse({ guestToken: 'guest-after-logout' }),
    )

    await useAuthStore.getState().logout()

    expect(window.localStorage.getItem(storageKeys.guestStarted)).toBeNull()
  })
})
