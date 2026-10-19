import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setAuthMode } from '../lib/auth'
import { useAuthStore } from '../store/authStore'
import { useSystemStore } from '../store/systemStore'
import { useAuthInitRetry } from './useAuthInitRetry'

const initialAuthStore = useAuthStore.getState()

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('useAuthInitRetry', () => {
  const init = vi.fn(async () => {})

  beforeEach(() => {
    init.mockClear()
    useAuthStore.setState(initialAuthStore, true)
    useAuthStore.setState({ init, initialized: true, state: null })
    useSystemStore.setState({ status: 'unavailable' })
  })

  afterEach(() => {
    useAuthStore.setState(initialAuthStore, true)
    useSystemStore.setState({ status: 'unknown' })
  })

  it('retries init when the backend becomes available after a failed member restore', () => {
    setAuthMode('member')
    renderHook(() => useAuthInitRetry(true))

    useSystemStore.getState().setStatus('available')

    expect(init).toHaveBeenCalledTimes(1)
  })

  it('retries init when the app comes back to the foreground', () => {
    setAuthMode('member')
    renderHook(() => useAuthInitRetry(true))

    setVisibility('visible')

    expect(init).toHaveBeenCalledTimes(1)
  })

  it('does nothing for guests or when a session is already restored', () => {
    setAuthMode('guest')
    const { unmount } = renderHook(() => useAuthInitRetry(true))
    useSystemStore.getState().setStatus('available')
    setVisibility('visible')
    unmount()

    setAuthMode('member')
    useSystemStore.setState({ status: 'unavailable' })
    useAuthStore.setState({
      state: { type: 'member', accessToken: 't', user: { id: 'u', email: null, nickname: 'n' } },
    })
    renderHook(() => useAuthInitRetry(true))
    useSystemStore.getState().setStatus('available')

    expect(init).not.toHaveBeenCalled()
  })

  it('waits until enabled (mock worker ready)', () => {
    setAuthMode('member')
    renderHook(() => useAuthInitRetry(false))

    useSystemStore.getState().setStatus('available')

    expect(init).not.toHaveBeenCalled()
  })
})
