import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock modules before importing http
vi.mock('../store/authStore', () => {
  const mockGetState = vi.fn()
  return {
    useAuthStore: { getState: mockGetState },
  }
})

vi.mock('./baseUrl', () => ({
  buildApiUrl: (path: string) => `http://test${path}`,
}))

// We need a fresh module for each test to reset refreshPromise
async function loadHttp() {
  vi.resetModules()
  // Re-apply mocks after resetModules
  const mockGetState = vi.fn()
  vi.doMock('../store/authStore', () => ({
    useAuthStore: { getState: mockGetState },
  }))
  vi.doMock('./baseUrl', () => ({
    buildApiUrl: (path: string) => `http://test${path}`,
  }))

  const mod = await import('./http')
  const { useAuthStore } = await import('../store/authStore')
  return { http: mod.http, getState: useAuthStore.getState as ReturnType<typeof vi.fn> }
}

describe('http 401 refresh singleton', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.useRealTimers()
  })

  it('two parallel 401s call refresh() exactly once', async () => {
    const { http, getState } = await loadHttp()

    const refreshFn = vi.fn(() => Promise.resolve())
    const getTokenFn = vi.fn().mockReturnValue('old-token')
    let fetchCallCount = 0

    getState.mockReturnValue({
      state: { type: 'member' },
      getToken: getTokenFn,
      refresh: refreshFn,
    })

    globalThis.fetch = vi.fn(async () => {
      fetchCallCount++
      // First two calls return 401, subsequent calls return 200
      if (fetchCallCount <= 2) {
        return new Response('{}', { status: 401 })
      }
      return new Response('{}', { status: 200 })
    })

    const p1 = http('GET', '/test1')
    const p2 = http('GET', '/test2')

    await Promise.all([p1, p2])

    expect(refreshFn).toHaveBeenCalledTimes(1)
  })

  it('after refresh succeeds, both requests retry with the new token', async () => {
    const { http, getState } = await loadHttp()

    const refreshFn = vi.fn(() => Promise.resolve())
    let callIndex = 0

    getState.mockReturnValue({
      state: { type: 'member' },
      getToken: vi.fn().mockReturnValue('new-token'),
      refresh: refreshFn,
    })

    const fetchMock = vi.fn(async () => {
      callIndex++
      // First two calls → 401, retries → 200
      if (callIndex <= 2) {
        return new Response('{}', { status: 401 })
      }
      return new Response('{}', { status: 200 })
    })
    globalThis.fetch = fetchMock

    await Promise.all([http('GET', '/a'), http('GET', '/b')])

    // 2 initial + 2 retries = 4 fetch calls
    expect(fetchMock).toHaveBeenCalledTimes(4)

    // The retry calls (3rd and 4th) should use 'new-token'
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>
    expect(calls[2][1]?.headers).toHaveProperty('Authorization', 'Bearer new-token')
    expect(calls[3][1]?.headers).toHaveProperty('Authorization', 'Bearer new-token')
  })

  it('throws when member becomes guest after refresh failure', async () => {
    const { http, getState } = await loadHttp()

    let stateAfterRefresh = false
    const refreshFn = vi.fn(() => {
      stateAfterRefresh = true
      return Promise.resolve()
    })

    getState.mockImplementation(() => {
      if (stateAfterRefresh) {
        return {
          state: { type: 'guest' },
          getToken: vi.fn().mockReturnValue('guest-token'),
          refresh: refreshFn,
        }
      }
      return {
        state: { type: 'member' },
        getToken: vi.fn().mockReturnValue('expired-token'),
        refresh: refreshFn,
      }
    })

    globalThis.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401 })
    })

    await expect(http('GET', '/protected')).rejects.toMatchObject({
      status: 401,
    })
  })
})
