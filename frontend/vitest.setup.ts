import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, vi } from 'vitest'
import { server } from './src/mocks/server'

const playMediaMock = vi.fn().mockResolvedValue(undefined)
const pauseMediaMock = vi.fn()
const loadMediaMock = vi.fn()

class MockAudioContext {
  currentTime = 0
  destination = {}

  createOscillator() {
    return {
      connect: vi.fn(),
      frequency: {
        setValueAtTime: vi.fn(),
      },
      type: 'sine',
      start: vi.fn(),
      stop: vi.fn(),
    }
  }

  createGain() {
    return {
      connect: vi.fn(),
      gain: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
    }
  }
}

if (typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

if (!('scrollIntoView' in HTMLElement.prototype)) {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    writable: true,
    value: vi.fn(),
  })
}

if (!('ResizeObserver' in window)) {
  Object.defineProperty(window, 'ResizeObserver', {
    writable: true,
    value: class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  })
}

if (!('AudioContext' in globalThis)) {
  Object.defineProperty(globalThis, 'AudioContext', {
    writable: true,
    value: MockAudioContext,
  })
}

if (!('AudioContext' in window)) {
  Object.defineProperty(window, 'AudioContext', {
    writable: true,
    value: MockAudioContext,
  })
}

Object.defineProperty(HTMLMediaElement.prototype, 'play', {
  configurable: true,
  writable: true,
  value: playMediaMock,
})

Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
  configurable: true,
  writable: true,
  value: pauseMediaMock,
})

Object.defineProperty(HTMLMediaElement.prototype, 'load', {
  configurable: true,
  writable: true,
  value: loadMediaMock,
})

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  cleanup()
  server.resetHandlers()
  window.localStorage.clear()
  window.sessionStorage.clear()
  playMediaMock.mockClear()
  pauseMediaMock.mockClear()
  loadMediaMock.mockClear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
afterAll(() => server.close())
