import { describe, expect, it } from 'vitest'
import {
  formatTimeRange,
  formatDateLabel,
  formatDateRangeLabel,
  formatDateWithWeekday,
  formatMonthLabel,
  formatRelativeDayLabel,
  formatPausedClock,
  formatRunningTime,
  formatStoppedTime,
} from './time'

const TODAY = new Date(2026, 9, 19)

describe('formatStoppedTime', () => {
  it('1분 미만은 초, 그 이상은 분과 시간으로 쓴다', () => {
    expect(formatStoppedTime(0)).toBe('0분')
    expect(formatStoppedTime(45)).toBe('45초')
    expect(formatStoppedTime(25 * 60)).toBe('25분')
    expect(formatStoppedTime(75 * 60)).toBe('1시간 15분')
    expect(formatStoppedTime(200 * 60)).toBe('3시간 20분')
  })

  it('정각은 분을 생략한다', () => {
    expect(formatStoppedTime(3600)).toBe('1시간')
  })
})

describe('formatRunningTime', () => {
  it('단계 이름 뒤에 mm:ss를 붙인다', () => {
    expect(formatRunningTime('focus', 18 * 60 + 34)).toBe('집중 18:34')
    expect(formatRunningTime('break', 5 * 60)).toBe('휴식 5:00')
    expect(formatRunningTime('focus', 200 * 60)).toBe('집중 200:00')
  })
})

describe('formatPausedClock', () => {
  it('멈춘 시계는 단계 이름과 일시정지를 붙이고 분:초를 유지한다', () => {
    expect(formatPausedClock('focus', 12 * 60 + 30)).toBe('집중 일시정지 · 12:30')
    expect(formatPausedClock('break', 59)).toBe('휴식 일시정지 · 0:59')
  })
})

describe('formatDateLabel', () => {
  it('같은 해는 연도를 뺀다', () => {
    expect(formatDateLabel(new Date(2026, 9, 19), TODAY)).toBe('10월 19일')
  })

  it('다른 해는 연도를 붙인다', () => {
    expect(formatDateLabel(new Date(2025, 11, 31), TODAY)).toBe('2025년 12월 31일')
  })
})

describe('formatDateRangeLabel', () => {
  it('같은 달이면 끝 날짜의 달을 뺀다', () => {
    expect(formatDateRangeLabel(new Date(2026, 9, 19), new Date(2026, 9, 25), TODAY)).toBe('10월 19일 – 25일')
  })

  it('달이 다르면 둘 다 쓴다', () => {
    expect(formatDateRangeLabel(new Date(2026, 9, 26), new Date(2026, 10, 1), TODAY)).toBe('10월 26일 – 11월 1일')
  })

  it('오늘과 다른 해는 그쪽에 연도를 붙이고, 두 해가 다르면 끝에도 붙인다', () => {
    expect(formatDateRangeLabel(new Date(2025, 11, 29), new Date(2026, 0, 4), TODAY)).toBe('2025년 12월 29일 – 2026년 1월 4일')
    expect(formatDateRangeLabel(new Date(2026, 11, 29), new Date(2027, 0, 4), TODAY)).toBe('12월 29일 – 2027년 1월 4일')
  })

  it('지난해 안에서만 끝나는 기간은 시작에만 연도를 붙인다', () => {
    expect(formatDateRangeLabel(new Date(2025, 9, 13), new Date(2025, 9, 19), TODAY)).toBe('2025년 10월 13일 – 19일')
  })
})

describe('formatMonthLabel', () => {
  it('같은 해는 연도를 뺀다', () => {
    expect(formatMonthLabel(new Date(2026, 9, 1), TODAY)).toBe('10월')
    expect(formatMonthLabel(new Date(2025, 9, 1), TODAY)).toBe('2025년 10월')
  })
})

describe('formatDateWithWeekday', () => {
  it('날짜 뒤에 요일을 붙인다', () => {
    expect(formatDateWithWeekday(new Date(2026, 9, 19), TODAY)).toBe('10월 19일 월요일')
    expect(formatDateWithWeekday(new Date(2025, 11, 25), TODAY)).toBe('2025년 12월 25일 목요일')
  })
})

describe('formatRelativeDayLabel', () => {
  it('오늘은 비우고, 어제와 내일은 이름으로 쓴다', () => {
    expect(formatRelativeDayLabel(new Date(2026, 9, 19), TODAY)).toBeNull()
    expect(formatRelativeDayLabel(new Date(2026, 9, 18), TODAY)).toBe('어제')
    expect(formatRelativeDayLabel(new Date(2026, 9, 20), TODAY)).toBe('내일')
  })

  it('그 밖의 날은 며칠 전, 며칠 후로 쓰고 다른 해는 비운다', () => {
    expect(formatRelativeDayLabel(new Date(2026, 9, 12), TODAY)).toBe('7일 전')
    expect(formatRelativeDayLabel(new Date(2026, 10, 2), TODAY)).toBe('14일 후')
    expect(formatRelativeDayLabel(new Date(2025, 11, 25), TODAY)).toBeNull()
  })

  it('하루 안의 시각과 상관없이 날짜로 센다', () => {
    expect(formatRelativeDayLabel(new Date(2026, 9, 18, 23, 59), new Date(2026, 9, 19, 0, 1))).toBe('어제')
  })
})

describe('formatTimeRange', () => {
  it('미니 데이 구간은 24시간 "06:00–12:00" 한 형식이고, 구분자는 기간과 같은 en dash다', () => {
    expect(formatTimeRange('06:00', '12:00')).toBe('06:00–12:00')
    expect(formatTimeRange('18:00', '24:00')).toBe('18:00–24:00')
  })

  it('한 자리 시각은 두 자리로 맞추고, 비어 있으면 빈 글자다', () => {
    expect(formatTimeRange(' 6:05 ', '9:30')).toBe('06:05–09:30')
    expect(formatTimeRange('', '12:00')).toBe('')
  })
})
