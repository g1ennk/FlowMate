import { describe, expect, it } from 'vitest'
import {
  formatPeriodLabel,
  formatTaskDateLabel,
  getPeriodRange,
} from './reviewUtils'

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
})
