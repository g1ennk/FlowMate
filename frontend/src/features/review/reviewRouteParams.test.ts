import { describe, expect, it } from 'vitest'
import {
  PERIOD_VIEW_MODES,
  REVIEW_PERIODS,
  VIEW_MODE_PERIODS,
  buildReviewQuery,
  getReviewRouteState,
  resolveReviewPeriod,
} from './reviewRouteParams'

describe('reviewRouteParams', () => {
  it('supports yearly period and year view mode mapping', () => {
    expect(REVIEW_PERIODS).toContain('yearly')
    expect(PERIOD_VIEW_MODES.yearly).toBe('year')
    expect(VIEW_MODE_PERIODS.year).toBe('yearly')
  })

  it('parses route state from query params', () => {
    const params = new URLSearchParams({ period: 'yearly', date: '2026-01-09' })
    const state = getReviewRouteState(params)

    expect(state.period).toBe('yearly')
    expect(state.dateKey).toBe('2026-01-09')
    expect(state.viewMode).toBe('year')
  })

  it('falls back to daily for invalid period and builds query', () => {
    expect(resolveReviewPeriod('quarterly')).toBe('daily')
    expect(buildReviewQuery('weekly', '2026-01-09')).toBe('period=weekly&date=2026-01-09')
  })
})
