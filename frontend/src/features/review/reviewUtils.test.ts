import { describe, expect, it } from 'vitest'
import {
  formatPeriodLabel,
  formatTaskDateLabel,
  getCalendarRange,
  getPeriodRange,
} from './reviewUtils'

describe('reviewUtils', () => {
  it('builds yearly period and calendar ranges', () => {
    const baseDate = new Date(2026, 4, 10)

    const periodRange = getPeriodRange('yearly', baseDate)
    const calendarRange = getCalendarRange('year', baseDate)

    expect(periodRange.startKey).toBe('2026-01-01')
    expect(periodRange.endKey).toBe('2026-12-31')
    expect(calendarRange.startKey).toBe('2026-01-01')
    expect(calendarRange.endKey).toBe('2026-12-31')
  })

  it('formats task date labels with weekday', () => {
    expect(formatTaskDateLabel('2026-01-09')).toBe('01.09 (금)')
  })

  it('formats yearly period title', () => {
    const label = formatPeriodLabel('yearly', new Date(2026, 2, 4))
    expect(label).toContain('2026')
  })
})
