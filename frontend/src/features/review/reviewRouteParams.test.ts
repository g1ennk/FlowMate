import { describe, expect, it } from 'vitest'
import {
  REVIEW_PERIODS,
  buildReviewQuery,
  getReviewRouteState,
  resolveReviewPeriod,
} from './reviewRouteParams'

describe('reviewRouteParams', () => {
  it('supports daily/weekly/monthly periods', () => {
    expect(REVIEW_PERIODS).toEqual(['daily', 'weekly', 'monthly'])
  })

  it('parses route state from query params', () => {
    const params = new URLSearchParams({ period: 'monthly', date: '2026-01-09' })
    const state = getReviewRouteState(params)

    expect(state.period).toBe('monthly')
    expect(state.dateKey).toBe('2026-01-09')
  })

  it('falls back to daily for invalid period and builds query', () => {
    expect(resolveReviewPeriod('quarterly')).toBe('daily')
    expect(buildReviewQuery('weekly', '2026-01-09')).toBe('period=weekly&date=2026-01-09')
  })
})
