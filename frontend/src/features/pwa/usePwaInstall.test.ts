import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePwaInstall } from './usePwaInstall'

type DeferredPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{
    outcome: 'accepted' | 'dismissed'
    platform: string
  }>
}

const originalUserAgent = window.navigator.userAgent
const originalPlatform = window.navigator.platform
const originalMaxTouchPoints = window.navigator.maxTouchPoints
const originalMatchMedia = window.matchMedia

const createMatchMediaMock = (initial = false) => {
  let matches = initial
  const listeners = new Set<(event: MediaQueryListEvent) => void>()
  const mediaQuery = {
    media: '(display-mode: standalone)',
    matches,
    onchange: null,
    addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
      if (typeof listener === 'function') {
        listeners.add(listener as (event: MediaQueryListEvent) => void)
      }
    },
    removeEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
      if (typeof listener === 'function') {
        listeners.delete(listener as (event: MediaQueryListEvent) => void)
      }
    },
    addListener: (listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener)
    },
    removeListener: (listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener)
    },
    dispatchEvent: () => true,
  } as unknown as MediaQueryList

  const setMatches = (next: boolean) => {
    matches = next
    Object.defineProperty(mediaQuery, 'matches', { value: matches, configurable: true })
    const event = { matches, media: '(display-mode: standalone)' } as MediaQueryListEvent
    listeners.forEach((listener) => listener(event))
  }

  const matchMedia = vi.fn().mockImplementation(() => mediaQuery)
  return { matchMedia, setMatches }
}

const setNavigatorValue = (key: 'userAgent' | 'platform' | 'maxTouchPoints', value: string | number) => {
  Object.defineProperty(window.navigator, key, {
    value,
    configurable: true,
  })
}

describe('usePwaInstall', () => {
  beforeEach(() => {
    const { matchMedia } = createMatchMediaMock(false)
    Object.defineProperty(window, 'matchMedia', {
      value: matchMedia,
      configurable: true,
    })
    setNavigatorValue('userAgent', originalUserAgent)
    setNavigatorValue('platform', originalPlatform)
    setNavigatorValue('maxTouchPoints', originalMaxTouchPoints)
  })

  afterEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      value: originalMatchMedia,
      configurable: true,
    })
    setNavigatorValue('userAgent', originalUserAgent)
    setNavigatorValue('platform', originalPlatform)
    setNavigatorValue('maxTouchPoints', originalMaxTouchPoints)
  })

  it('stores deferred install event and resolves accepted install', async () => {
    const { result } = renderHook(() => usePwaInstall())

    const prompt = vi.fn().mockResolvedValue(undefined)
    const deferredEvent = new Event('beforeinstallprompt') as DeferredPromptEvent
    deferredEvent.prompt = prompt
    deferredEvent.userChoice = Promise.resolve({ outcome: 'accepted', platform: 'web' })

    act(() => {
      window.dispatchEvent(deferredEvent)
    })

    await waitFor(() => expect(result.current.canInstall).toBe(true))

    let installResult: Awaited<ReturnType<typeof result.current.promptInstall>> = 'unsupported'
    await act(async () => {
      installResult = await result.current.promptInstall()
    })

    expect(prompt).toHaveBeenCalledTimes(1)
    expect(installResult).toBe('accepted')
    expect(result.current.isInstalled).toBe(true)
    expect(result.current.canInstall).toBe(false)
  })

  it('marks installed when appinstalled event is dispatched', async () => {
    const { result } = renderHook(() => usePwaInstall())

    expect(result.current.isInstalled).toBe(false)

    act(() => {
      window.dispatchEvent(new Event('appinstalled'))
    })

    await waitFor(() => expect(result.current.isInstalled).toBe(true))
  })

  it('detects iOS environment', () => {
    setNavigatorValue('userAgent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')
    setNavigatorValue('platform', 'iPhone')
    setNavigatorValue('maxTouchPoints', 5)

    const { result } = renderHook(() => usePwaInstall())

    expect(result.current.isIos).toBe(true)
    expect(result.current.canInstall).toBe(false)
  })

  it('updates standalone and installed state from display-mode changes', async () => {
    const { matchMedia, setMatches } = createMatchMediaMock(false)
    Object.defineProperty(window, 'matchMedia', {
      value: matchMedia,
      configurable: true,
    })

    const { result } = renderHook(() => usePwaInstall())

    expect(result.current.isStandalone).toBe(false)
    expect(result.current.isInstalled).toBe(false)

    act(() => {
      setMatches(true)
    })

    await waitFor(() => expect(result.current.isStandalone).toBe(true))
    expect(result.current.isInstalled).toBe(true)
  })
})
