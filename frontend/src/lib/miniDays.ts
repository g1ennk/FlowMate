import type { MiniDaysSettings } from '../api/types'

export type MiniDayRange = MiniDaysSettings['day1']

export type MiniDaysErrors = Partial<Record<keyof MiniDaysSettings | 'order', string>>

export const defaultMiniDaysSettings: MiniDaysSettings = {
  day1: { label: '오전', start: '06:00', end: '12:00' },
  day2: { label: '오후', start: '12:00', end: '18:00' },
  day3: { label: '저녁', start: '18:00', end: '24:00' },
}

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

const MINI_DAY_KEYS = ['day1', 'day2', 'day3'] as const

// "HH:MM"을 자정부터의 분으로 바꾼다. 종료 시각은 24:00(자정)까지 허용한다.
export function parseMiniDayTime(value: string, allow24: boolean) {
  const trimmed = value.trim()
  if (allow24 && trimmed === '24:00') return 24 * 60
  const match = TIME_RE.exec(trimmed)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  return hours * 60 + minutes
}

// 구간이 겹치면 앞 구간(1 → 2 → 3)이 우선한다. 어느 구간에도 없으면 0(미분류).
export function getMiniDayFromTime(date: Date, settings: MiniDaysSettings): number {
  const minutes = date.getHours() * 60 + date.getMinutes()
  const index = MINI_DAY_KEYS.findIndex((key) => {
    const start = parseMiniDayTime(settings[key].start, false)
    const end = parseMiniDayTime(settings[key].end, true)
    return start !== null && end !== null && minutes >= start && minutes < end
  })
  return index + 1
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
  )
}

export function getDefaultMiniDayForDate(selectedDate: Date, settings: MiniDaysSettings): number {
  const now = new Date()
  if (!isSameDay(selectedDate, now)) return 0
  return getMiniDayFromTime(now, settings)
}

export function validateMiniDaysSettings(settings: MiniDaysSettings): MiniDaysErrors {
  const errors: MiniDaysErrors = {}

  const label1 = settings.day1.label.trim()
  const label2 = settings.day2.label.trim()
  const label3 = settings.day3.label.trim()

  if (!label1) errors.day1 = '라벨을 입력해주세요'
  if (!label2) errors.day2 = '라벨을 입력해주세요'
  if (!label3) errors.day3 = '라벨을 입력해주세요'
  if (label1.length > 50) errors.day1 = '라벨은 50자 이하여야 해요'
  if (label2.length > 50) errors.day2 = '라벨은 50자 이하여야 해요'
  if (label3.length > 50) errors.day3 = '라벨은 50자 이하여야 해요'

  const day1StartRaw = settings.day1.start.trim()
  const day1EndRaw = settings.day1.end.trim()
  const day2StartRaw = settings.day2.start.trim()
  const day2EndRaw = settings.day2.end.trim()
  const day3StartRaw = settings.day3.start.trim()
  const day3EndRaw = settings.day3.end.trim()

  const day1Start = day1StartRaw ? parseMiniDayTime(day1StartRaw, false) : null
  const day1End = day1EndRaw ? parseMiniDayTime(day1EndRaw, true) : null
  const day2Start = day2StartRaw ? parseMiniDayTime(day2StartRaw, false) : null
  const day2End = day2EndRaw ? parseMiniDayTime(day2EndRaw, true) : null
  const day3Start = day3StartRaw ? parseMiniDayTime(day3StartRaw, false) : null
  const day3End = day3EndRaw ? parseMiniDayTime(day3EndRaw, true) : null

  if ((day1StartRaw && day1Start === null) || (day1EndRaw && day1End === null)) {
    errors.day1 = '형식은 HH:MM 이어야 해요'
  } else if (day1Start !== null && day1End !== null && day1Start >= day1End) {
    errors.day1 = '시작은 종료보다 빨라야 해요'
  }

  if ((day2StartRaw && day2Start === null) || (day2EndRaw && day2End === null)) {
    errors.day2 = '형식은 HH:MM 이어야 해요'
  } else if (day2Start !== null && day2End !== null && day2Start >= day2End) {
    errors.day2 = '시작은 종료보다 빨라야 해요'
  }

  if ((day3StartRaw && day3Start === null) || (day3EndRaw && day3End === null)) {
    errors.day3 = '형식은 HH:MM 이어야 해요'
  } else if (day3Start !== null && day3End !== null && day3Start >= day3End) {
    errors.day3 = '시작은 종료보다 빨라야 해요'
  }

  return errors
}

export function normalizeMiniDaysSettings(settings?: MiniDaysSettings | null): MiniDaysSettings {
  if (!settings) return defaultMiniDaysSettings
  return {
    day1: {
      ...defaultMiniDaysSettings.day1,
      ...settings.day1,
      label: settings.day1.label?.trim() || defaultMiniDaysSettings.day1.label,
    },
    day2: {
      ...defaultMiniDaysSettings.day2,
      ...settings.day2,
      label: settings.day2.label?.trim() || defaultMiniDaysSettings.day2.label,
    },
    day3: {
      ...defaultMiniDaysSettings.day3,
      ...settings.day3,
      label: settings.day3.label?.trim() || defaultMiniDaysSettings.day3.label,
    },
  }
}
