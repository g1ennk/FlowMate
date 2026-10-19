import { describe, expect, it } from 'vitest'
import type { MiniDaysSettings } from '../api/types'
import { defaultMiniDaysSettings, getMiniDayFromTime } from './miniDays'

function at(hours: number, minutes = 0) {
  return new Date(2026, 9, 19, hours, minutes)
}

describe('getMiniDayFromTime', () => {
  it('matches the default sections by their start and end', () => {
    expect(getMiniDayFromTime(at(5, 59), defaultMiniDaysSettings)).toBe(0)
    expect(getMiniDayFromTime(at(6), defaultMiniDaysSettings)).toBe(1)
    expect(getMiniDayFromTime(at(12), defaultMiniDaysSettings)).toBe(2)
    expect(getMiniDayFromTime(at(23, 59), defaultMiniDaysSettings)).toBe(3)
  })

  it('treats 24:00 as midnight for the first section', () => {
    const settings: MiniDaysSettings = {
      day1: { label: '밤', start: '20:00', end: '24:00' },
      day2: { label: '오전', start: '06:00', end: '12:00' },
      day3: { label: '오후', start: '12:00', end: '18:00' },
    }
    expect(getMiniDayFromTime(at(23, 30), settings)).toBe(1)
  })

  it('treats 24:00 as midnight for the second section', () => {
    const settings: MiniDaysSettings = {
      day1: { label: '오전', start: '06:00', end: '12:00' },
      day2: { label: '밤', start: '20:00', end: '24:00' },
      day3: { label: '오후', start: '12:00', end: '18:00' },
    }
    expect(getMiniDayFromTime(at(23, 30), settings)).toBe(2)
  })

  it('gives the earlier section priority when sections overlap', () => {
    const settings: MiniDaysSettings = {
      day1: { label: '오전', start: '06:00', end: '13:00' },
      day2: { label: '오후', start: '12:00', end: '18:00' },
      day3: { label: '저녁', start: '18:00', end: '24:00' },
    }
    expect(getMiniDayFromTime(at(12, 30), settings)).toBe(1)
  })
})
