import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setAuthMode } from '../lib/auth'
import { useAuthStore } from '../store/authStore'
import { useSystemStore } from '../store/systemStore'
import { useAuthInitRetry } from './useAuthInitRetry'

const initialAuthStore = useAuthStore.getState()
const initialSystemStore = useSystemStore.getState()
const originalFetch = globalThis.fetch

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('useAuthInitRetry', () => {
  const init = vi.fn(async () => {})

  beforeEach(() => {
    init.mockClear()
    useAuthStore.setState(initialAuthStore, true)
    useSystemStore.setState(initialSystemStore, true)
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    useAuthStore.setState(initialAuthStore, true)
    useSystemStore.setState(initialSystemStore, true)
  })

  it('retries once when the backend recovers after a single failed health check', () => {
    setAuthMode('member')
    useAuthStore.setState({ init, initialized: true, state: null })
    // 실패 1회는 장애로 보지 않아 status는 available 그대로다
    useSystemStore.setState({ status: 'available' })
    renderHook(() => useAuthInitRetry(true))

    useSystemStore.getState().recordHealth(false)
    useSystemStore.getState().recordHealth(true)
    useSystemStore.getState().recordHealth(true)

    expect(init).toHaveBeenCalledTimes(1)
  })

  it('retries when the app comes back to the foreground after a failed restore', () => {
    setAuthMode('member')
    useAuthStore.setState({ init, initialized: true, state: null })
    renderHook(() => useAuthInitRetry(true))

    setVisibility('visible')

    expect(init).toHaveBeenCalledTimes(1)
  })

  it('does not send a second /auth/refresh while the cold-start init is still running', async () => {
    setAuthMode('member')
    let resolveRefresh!: (response: Response) => void
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveRefresh = resolve
        }),
    )
    globalThis.fetch = fetchMock
    const initSpy = vi.spyOn(useAuthStore.getState(), 'init')
    renderHook(() => useAuthInitRetry(true))

    const firstInit = useAuthStore.getState().init()
    useSystemStore.getState().recordHealth(true) // 콜드 스타트 unknown → available
    useSystemStore.getState().recordHealth(false)
    useSystemStore.getState().recordHealth(true)
    setVisibility('visible')

    expect(initSpy).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    resolveRefresh(
      new Response(
        JSON.stringify({ accessToken: 't', user: { id: 'u', email: null, nickname: 'n' } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    await firstInit
  })

  it('does nothing when the member session is already restored, or for guests', () => {
    setAuthMode('member')
    useAuthStore.setState({
      init,
      initialized: true,
      state: { type: 'member', accessToken: 't', user: { id: 'u', email: null, nickname: 'n' } },
    })
    const { unmount } = renderHook(() => useAuthInitRetry(true))
    useSystemStore.getState().recordHealth(false)
    useSystemStore.getState().recordHealth(true)
    setVisibility('visible')
    unmount()

    setAuthMode('guest')
    useAuthStore.setState({ state: null })
    renderHook(() => useAuthInitRetry(true))
    useSystemStore.getState().recordHealth(false)
    useSystemStore.getState().recordHealth(true)
    setVisibility('visible')

    expect(init).not.toHaveBeenCalled()
  })

  it('waits until enabled (mock worker ready)', () => {
    setAuthMode('member')
    useAuthStore.setState({ init, initialized: true, state: null })
    renderHook(() => useAuthInitRetry(false))

    useSystemStore.getState().recordHealth(false)
    useSystemStore.getState().recordHealth(true)

    expect(init).not.toHaveBeenCalled()
  })
})
