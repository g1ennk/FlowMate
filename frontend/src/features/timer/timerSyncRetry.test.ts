import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  canRetry,
  clearRetry,
  computeRetryDelayMs,
  markRetry,
  type RetryState,
} from './timerSyncRetry'

describe('computeRetryDelayMs', () => {
  it('attempt 1 returns ~1000ms (base) + jitter (0-299)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    expect(computeRetryDelayMs(1)).toBe(1000)

    vi.spyOn(Math, 'random').mockReturnValue(0.999)
    expect(computeRetryDelayMs(1)).toBe(1299)
  })

  it('attempt 2 returns ~2000ms + jitter', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    expect(computeRetryDelayMs(2)).toBe(2000)
  })

  it('attempt 3 returns ~4000ms + jitter', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    expect(computeRetryDelayMs(3)).toBe(4000)
  })

  it('caps at 60000ms for very high attempts', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    expect(computeRetryDelayMs(100)).toBe(60000)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })
})

describe('canRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-06T09:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns true when no entry exists', () => {
    const retries: RetryState = {}
    expect(canRetry(retries, 'key1')).toBe(true)
  })

  it('returns false when nextRetryAt is in the future', () => {
    const retries: RetryState = {
      key1: { attempt: 1, nextRetryAt: Date.now() + 5000 },
    }
    expect(canRetry(retries, 'key1')).toBe(false)
  })

  it('returns true when nextRetryAt has passed', () => {
    const retries: RetryState = {
      key1: { attempt: 1, nextRetryAt: Date.now() - 1 },
    }
    expect(canRetry(retries, 'key1')).toBe(true)
  })

  it('returns true when nextRetryAt is exactly now', () => {
    const retries: RetryState = {
      key1: { attempt: 1, nextRetryAt: Date.now() },
    }
    expect(canRetry(retries, 'key1')).toBe(true)
  })
})

describe('markRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-06T09:00:00.000Z'))
    vi.spyOn(Math, 'random').mockReturnValue(0)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('increments attempt from 0 to 1', () => {
    const retries: RetryState = {}
    markRetry(retries, 'key1')
    expect(retries.key1.attempt).toBe(1)
  })

  it('increments attempt from 1 to 2', () => {
    const retries: RetryState = {
      key1: { attempt: 1, nextRetryAt: Date.now() },
    }
    markRetry(retries, 'key1')
    expect(retries.key1.attempt).toBe(2)
  })

  it('sets nextRetryAt correctly for attempt 1', () => {
    const retries: RetryState = {}
    markRetry(retries, 'key1')
    // attempt 1 → delay = 1000 + 0 jitter
    expect(retries.key1.nextRetryAt).toBe(Date.now() + 1000)
  })
})

describe('clearRetry', () => {
  it('removes the entry', () => {
    const retries: RetryState = {
      key1: { attempt: 3, nextRetryAt: 999 },
    }
    clearRetry(retries, 'key1')
    expect(retries.key1).toBeUndefined()
  })

  it('does nothing for non-existent key', () => {
    const retries: RetryState = {}
    clearRetry(retries, 'nope')
    expect(Object.keys(retries)).toHaveLength(0)
  })
})
