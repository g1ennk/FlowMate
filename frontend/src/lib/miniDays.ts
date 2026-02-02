import type { MiniDaysSettings } from '../api/types'

export type MiniDayRange = MiniDaysSettings['day1']

export type MiniDaysErrors = Partial<Record<keyof MiniDaysSettings | 'order', string>>

export const defaultMiniDaysSettings: MiniDaysSettings = {
  day1: { label: '오전', start: '06:00', end: '12:00' },
  day2: { label: '오후', start: '12:00', end: '18:00' },
  day3: { label: '저녁', start: '18:00', end: '24:00' },
}

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

function parseTime(value: string, allow24: boolean) {
  if (allow24 && value === '24:00') return 24 * 60
  const match = TIME_RE.exec(value)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  return hours * 60 + minutes
}

export function validateMiniDaysSettings(settings: MiniDaysSettings): MiniDaysErrors {
  const errors: MiniDaysErrors = {}

  const label1 = settings.day1.label.trim()
  const label2 = settings.day2.label.trim()
  const label3 = settings.day3.label.trim()

  if (!label1) errors.day1 = '라벨을 입력해주세요'
  if (!label2) errors.day2 = '라벨을 입력해주세요'
  if (!label3) errors.day3 = '라벨을 입력해주세요'

  const day1Start = parseTime(settings.day1.start, false)
  const day1End = parseTime(settings.day1.end, false)
  const day2Start = parseTime(settings.day2.start, false)
  const day2End = parseTime(settings.day2.end, false)
  const day3Start = parseTime(settings.day3.start, false)
  const day3End = parseTime(settings.day3.end, true)

  if (day1Start === null || day1End === null) errors.day1 = '형식은 HH:MM 이어야 해요'
  if (day2Start === null || day2End === null) errors.day2 = '형식은 HH:MM 이어야 해요'
  if (day3Start === null || day3End === null) errors.day3 = '형식은 HH:MM 이어야 해요'

  if (day1Start !== null && day1End !== null && day2Start !== null && day2End !== null && day3Start !== null && day3End !== null) {
    if (day1Start >= day1End) errors.order = 'Day 1 시작은 종료보다 빨라야 해요'
    if (day1End !== day2Start) errors.order = 'Day 1 종료와 Day 2 시작을 맞춰주세요'
    if (day2Start >= day2End) errors.order = 'Day 2 시작은 종료보다 빨라야 해요'
    if (day2End !== day3Start) errors.order = 'Day 2 종료와 Day 3 시작을 맞춰주세요'
    if (day3Start >= day3End) errors.order = 'Day 3 시작은 종료보다 빨라야 해요'
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
