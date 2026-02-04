import { describe, expect, it } from 'vitest'
import { getTodoDisplayTimeSeconds } from './todoTimerDisplay'

describe('getTodoDisplayTimeSeconds', () => {
  it('uses confirmed session total for done todos to avoid double counting', () => {
    const display = getTodoDisplayTimeSeconds({
      isDone: true,
      sessionFocusSeconds: 10,
      isActiveTimer: true,
      activeTimerElapsedMs: 21_000,
      sessions: [{ sessionFocusSeconds: 10, breakSeconds: 0 }],
      initialFocusMs: 10_000,
    })

    expect(display).toBe(10)
  })

  it('accumulates stopwatch focus with baseline when active sessions exist', () => {
    const display = getTodoDisplayTimeSeconds({
      isDone: false,
      sessionFocusSeconds: 10,
      isActiveTimer: true,
      activeTimerElapsedMs: 21_000,
      sessions: [{ sessionFocusSeconds: 10, breakSeconds: 0 }],
      initialFocusMs: 10_000,
    })

    expect(display).toBe(21)
  })
})
