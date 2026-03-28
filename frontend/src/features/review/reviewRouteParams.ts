import { formatDateKey } from '../../lib/time'
import type { PeriodType } from './reviewTypes'
import { parseDateKey } from './reviewUtils'

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/

export const REVIEW_PERIODS: PeriodType[] = ['daily', 'weekly', 'monthly']

export function resolveReviewPeriod(value: string | null): PeriodType {
  return value && REVIEW_PERIODS.includes(value as PeriodType) ? (value as PeriodType) : 'daily'
}

export function resolveReviewDateKey(value: string | null): string {
  return value && DATE_KEY_RE.test(value) ? value : formatDateKey(new Date())
}

export function getReviewRouteState(searchParams: URLSearchParams) {
  const period = resolveReviewPeriod(searchParams.get('period'))
  const dateKey = resolveReviewDateKey(searchParams.get('date'))
  const baseDate = parseDateKey(dateKey)

  return {
    period,
    dateKey,
    baseDate,
  }
}

export function buildReviewQuery(period: PeriodType, dateKey: string): string {
  return new URLSearchParams({ period, date: dateKey }).toString()
}
