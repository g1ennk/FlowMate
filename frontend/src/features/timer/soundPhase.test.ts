import { describe, expect, it } from 'vitest'
import { getSoundPhase } from './soundPhase'
import type { TimerMode } from './timerTypes'

describe('getSoundPhase', () => {
  it.each([
    [{ status: 'running', phase: 'flow', flexiblePhase: null }, 'pomodoro', 'focus'],
    [{ status: 'running', phase: 'short', flexiblePhase: null }, 'pomodoro', 'break'],
    [{ status: 'running', phase: 'long', flexiblePhase: null }, 'pomodoro', 'break'],
    [{ status: 'running', phase: 'flow', flexiblePhase: 'focus' }, 'stopwatch', 'focus'],
    [{ status: 'running', phase: 'flow', flexiblePhase: 'break_suggested' }, 'stopwatch', 'break'],
    [{ status: 'running', phase: 'flow', flexiblePhase: 'break_free' }, 'stopwatch', 'break'],
    [{ status: 'waiting', phase: 'short', flexiblePhase: null }, 'pomodoro', 'waiting'],
    [{ status: 'waiting', phase: 'flow', flexiblePhase: 'focus' }, 'stopwatch', 'waiting'],
    [{ status: 'paused', phase: 'flow', flexiblePhase: null }, 'pomodoro', 'stopped'],
    [{ status: 'idle', phase: 'flow', flexiblePhase: null }, 'pomodoro', 'stopped'],
  ])('maps %o in %s mode to %s', (timer, mode, expected) => {
    expect(getSoundPhase(timer as never, mode as TimerMode)).toBe(expected)
  })

  it('returns stopped without a timer', () => {
    expect(getSoundPhase(null, 'pomodoro')).toBe('stopped')
  })
})
