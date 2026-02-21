import { describe, expect, it } from 'vitest'
import { getTodoDisplayTimeSeconds } from './todoTimerDisplay'

describe('getTodoDisplayTimeSeconds', () => {
  it('uses server aggregate when timer is inactive', () => {
    const display = getTodoDisplayTimeSeconds({
      isDone: false,
      sessionFocusSeconds: 1200,
      isActiveTimer: false,
      sessions: [{ sessionFocusSeconds: 5000, breakSeconds: 0 }],
    })

    expect(display).toBe(1200)
  })

  it('uses active elapsed time for running stopwatch focus', () => {
    const display = getTodoDisplayTimeSeconds({
      isDone: false,
      sessionFocusSeconds: 10,
      isActiveTimer: true,
      activeTimerElapsedMs: 21_000,
      sessions: [{ sessionFocusSeconds: 999, breakSeconds: 0 }],
    })

    expect(display).toBe(21)
  })

  it('never shows less than server aggregate for active stopwatch focus', () => {
    const display = getTodoDisplayTimeSeconds({
      isDone: false,
      sessionFocusSeconds: 1800,
      isActiveTimer: true,
      activeTimerElapsedMs: 600_000,
    })

    expect(display).toBe(1800)
  })

  it('keeps break countdown behavior in suggested break phase', () => {
    const display = getTodoDisplayTimeSeconds({
      isDone: false,
      sessionFocusSeconds: 100,
      isActiveTimer: true,
      flexiblePhase: 'break_suggested',
      breakTargetMs: 60_000,
      breakElapsedMs: 20_000,
    })

    expect(display).toBe(40)
  })
})
