import { describe, expect, it } from 'vitest'
import {
  buildPeriodStats,
  formatPeriodLabel,
  formatTaskDateLabel,
  getPeriodRange,
} from './reviewUtils'
import { defaultMiniDaysSettings } from '../../lib/miniDays'
import { initialSingleTimerState } from '../timer/timerStore'

describe('reviewUtils', () => {
  it('builds monthly period ranges', () => {
    const baseDate = new Date(2026, 4, 10)

    const periodRange = getPeriodRange('monthly', baseDate)

    expect(periodRange.startKey).toBe('2026-05-01')
    expect(periodRange.endKey).toBe('2026-05-31')
  })

  it('formats task date labels with weekday', () => {
    expect(formatTaskDateLabel('2026-01-09')).toBe('01.09 (금)')
  })

  it('formats monthly period title', () => {
    const label = formatPeriodLabel('monthly', new Date(2026, 2, 4))
    expect(label).toContain('2026')
  })

  it('uses server aggregates even when local timer sessions exist', () => {
    const todo = {
      id: 'todo-1',
      title: '세션 정합성',
      note: null,
      date: '2026-01-09',
      miniDay: 1,
      dayOrder: 0,
      isDone: false,
      sessionCount: 2,
      sessionFocusSeconds: 3000,
      timerMode: null,
      createdAt: '2026-01-09T00:00:00.000Z',
      updatedAt: '2026-01-09T00:00:00.000Z',
    }
    const timers = {
      [todo.id]: {
        ...initialSingleTimerState,
        mode: 'stopwatch' as const,
        status: 'paused' as const,
        sessions: [{ sessionFocusSeconds: 999, breakSeconds: 0 }],
      },
    }

    const stats = buildPeriodStats(
      [todo],
      timers,
      'daily',
      new Date('2026-01-09T00:00:00.000Z'),
      defaultMiniDaysSettings,
    )

    expect(stats.totalFocusSeconds).toBe(3000)
    expect(stats.totalFlows).toBe(2)
  })
})
