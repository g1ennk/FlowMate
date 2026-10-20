import { describe, expect, it } from 'vitest'
import type { MiniDaysSettings } from '../api/types'
import { defaultMiniDaysSettings, getMiniDayFromTime, hasMiniDayEnded } from './miniDays'

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

describe('hasMiniDayEnded', () => {
  it('구간 끝 시각부터 지난 것으로 본다', () => {
    expect(hasMiniDayEnded(1, defaultMiniDaysSettings, at(11, 59))).toBe(false)
    expect(hasMiniDayEnded(1, defaultMiniDaysSettings, at(12))).toBe(true)
    // 24:00에 끝나는 구간은 그날 안에 끝나지 않는다
    expect(hasMiniDayEnded(3, defaultMiniDaysSettings, at(23, 59))).toBe(false)
  })

  it('미분류(0)나 없는 구간은 지난 것으로 보지 않는다', () => {
    expect(hasMiniDayEnded(0, defaultMiniDaysSettings, at(23))).toBe(false)
    expect(hasMiniDayEnded(4, defaultMiniDaysSettings, at(23))).toBe(false)
  })
})
