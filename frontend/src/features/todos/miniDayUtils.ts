import type { MiniDaysSettings } from '../../api/types'

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

function parseTime(value: string, allow24: boolean) {
  if (allow24 && value === '24:00') return 24 * 60
  const match = TIME_RE.exec(value)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  return hours * 60 + minutes
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
  )
}

export function getMiniDayFromTime(date: Date, settings: MiniDaysSettings): number {
  const minutes = date.getHours() * 60 + date.getMinutes()

  const day1Start = parseTime(settings.day1.start.trim(), false)
  const day1End = parseTime(settings.day1.end.trim(), false)
  if (day1Start !== null && day1End !== null && minutes >= day1Start && minutes < day1End) {
    return 1
  }

  const day2Start = parseTime(settings.day2.start.trim(), false)
  const day2End = parseTime(settings.day2.end.trim(), false)
  if (day2Start !== null && day2End !== null && minutes >= day2Start && minutes < day2End) {
    return 2
  }

  const day3Start = parseTime(settings.day3.start.trim(), false)
  const day3End = parseTime(settings.day3.end.trim(), true)
  if (day3Start !== null && day3End !== null && minutes >= day3Start && minutes < day3End) {
    return 3
  }

  return 0
}

export function getDefaultMiniDayForDate(
  selectedDate: Date,
  settings: MiniDaysSettings,
): number {
  const now = new Date()
  if (!isSameDay(selectedDate, now)) return 0
  return getMiniDayFromTime(now, settings)
}
