import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildDailyGroups,
  buildMonthWeekGroups,
  buildReviewPlaceholder,
  formatFocusTime,
  buildStatDeltas,
  formatPeriodLabel,
  getPeriodRange,
} from './reviewUtils'
import type { TaskItem } from './reviewTypes'

describe('기간 라벨', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 19, 12))
  })
  afterEach(() => vi.useRealTimers())

  it('일간은 요일까지 쓰고 같은 해면 연도를 뺀다', () => {
    expect(formatPeriodLabel('daily', new Date(2026, 9, 19))).toBe('10월 19일 월요일')
  })

  it('주간은 "10월 19일 – 25일"로 쓴다', () => {
    expect(formatPeriodLabel('weekly', new Date(2026, 9, 21))).toBe('10월 19일 – 25일')
  })

  it('월간은 같은 해면 월만 쓴다', () => {
    expect(formatPeriodLabel('monthly', new Date(2026, 9, 5))).toBe('10월')
    expect(formatPeriodLabel('monthly', new Date(2025, 11, 5))).toBe('2025년 12월')
  })

  it('타임라인의 날 묶음은 일간과 같은 날짜 라벨을 쓴다', () => {
    const groups = buildDailyGroups({}, getPeriodRange('weekly', new Date(2026, 9, 21)))
    expect(groups.map((g) => g.dateKey)).toEqual([
      '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25',
    ])
    expect(groups[0].label).toBe('10월 19일 월요일')
  })
})

// 회고 입력 placeholder는 그 기간의 실제 기록으로 만든다(.impeccable.md §2-4, §8)
describe('buildReviewPlaceholder', () => {
  it('일간은 집중 횟수와 끝낸 할 일 수를 말하고 묻는다', () => {
    expect(buildReviewPlaceholder('daily', { focusCount: 3, completedCount: 5, isCurrent: true }))
      .toBe('오늘 집중 3회, 할 일 5개를 끝냈어요. 어땠어요?')
    expect(buildReviewPlaceholder('daily', { focusCount: 3, completedCount: 0, isCurrent: true }))
      .toBe('오늘 집중 3회. 어땠어요?')
    expect(buildReviewPlaceholder('daily', { focusCount: 0, completedCount: 2, isCurrent: true }))
      .toBe('오늘 할 일 2개를 끝냈어요. 어땠어요?')
  })

  it('기록이 없으면 묻기만 한다', () => {
    expect(buildReviewPlaceholder('daily', { focusCount: 0, completedCount: 0, isCurrent: true })).toBe('오늘 어땠어요?')
    expect(buildReviewPlaceholder('weekly', { focusCount: 0, completedCount: 0, isCurrent: true })).toBe('이번 주는 어땠어요?')
    expect(buildReviewPlaceholder('monthly', { focusCount: 0, completedCount: 0, isCurrent: true })).toBe('이번 달은 어땠어요?')
  })

  it('주간과 월간은 집중 횟수 하나로 짧게 말한다', () => {
    expect(buildReviewPlaceholder('weekly', { focusCount: 12, completedCount: 20, isCurrent: true }))
      .toBe('이번 주 집중 12회. 어떤 한 주였어요?')
    expect(buildReviewPlaceholder('monthly', { focusCount: 40, completedCount: 50, isCurrent: true }))
      .toBe('이번 달 집중 40회. 어떤 한 달이었어요?')
    expect(buildReviewPlaceholder('weekly', { focusCount: 0, completedCount: 4, isCurrent: true }))
      .toBe('이번 주 할 일 4개를 끝냈어요. 어떤 한 주였어요?')
  })

  it('지난 기간에는 "오늘", "이번 주" 대신 그 기간을 가리킨다', () => {
    expect(buildReviewPlaceholder('daily', { focusCount: 3, completedCount: 5, isCurrent: false }))
      .toBe('이날 집중 3회, 할 일 5개를 끝냈어요. 어땠어요?')
    expect(buildReviewPlaceholder('weekly', { focusCount: 0, completedCount: 0, isCurrent: false })).toBe('이 주는 어땠어요?')
    expect(buildReviewPlaceholder('monthly', { focusCount: 2, completedCount: 0, isCurrent: false }))
      .toBe('이 달 집중 2회. 어떤 한 달이었어요?')
  })
})

// 진행 중인 기간은 직전 기간 전체와 비교하지 않는다(.impeccable.md §8, 사용자 결정 2026-10-20).
// 끝난 기간만 칸마다 증감을 붙이고, 비교 대상은 접근성 이름에 글자로 붙인다
describe('buildStatDeltas', () => {
  const TODAY = '2026-10-20'
  const delta = (focusDelta: number, flowDelta: number, completedDelta: number) => ({ focusDelta, flowDelta, completedDelta })

  it('진행 중인 기간(오늘, 이번 주, 이번 달)에는 증감이 없다', () => {
    expect(buildStatDeltas('daily', getPeriodRange('daily', new Date(2026, 9, 20)), TODAY, delta(3300, 2, 1))).toBeNull()
    expect(buildStatDeltas('weekly', getPeriodRange('weekly', new Date(2026, 9, 20)), TODAY, delta(-3300, -2, -1))).toBeNull()
    expect(buildStatDeltas('monthly', getPeriodRange('monthly', new Date(2026, 9, 1)), TODAY, delta(60, 1, 1))).toBeNull()
  })

  it('아직 오지 않은 기간에도 증감이 없다', () => {
    expect(buildStatDeltas('daily', getPeriodRange('daily', new Date(2026, 9, 22)), TODAY, delta(0, 0, 0))).toBeNull()
  })

  it('끝난 기간은 칸마다 "+25분"처럼 쓰고, 접근성 이름에 비교 대상과 늘고 준 것을 말한다', () => {
    const d = buildStatDeltas('daily', getPeriodRange('daily', new Date(2026, 9, 19)), TODAY, delta(3300, 2, -1))!
    expect(d.focus).toEqual({ text: '+55분', label: '전날보다 집중 시간 55분 늘었어요', trend: 'up' })
    expect(d.flow).toEqual({ text: '+2회', label: '전날보다 집중 횟수 2회 늘었어요', trend: 'up' })
    expect(d.completed).toEqual({ text: '-1개', label: '전날보다 완료 1개 줄었어요', trend: 'down' })

    const w = buildStatDeltas('weekly', getPeriodRange('weekly', new Date(2026, 9, 12)), TODAY, delta(-4500, 0, 3))!
    expect(w.focus).toEqual({ text: '-1시간 15분', label: '전 주보다 집중 시간 1시간 15분 줄었어요', trend: 'down' })
    expect(w.completed.label).toBe('전 주보다 완료 3개 늘었어요')

    const m = buildStatDeltas('monthly', getPeriodRange('monthly', new Date(2026, 8, 1)), TODAY, delta(0, 4, 0))!
    expect(m.flow.label).toBe('전달보다 집중 횟수 4회 늘었어요')
  })

  it('달라진 것이 없으면(1분 미만 차이 포함) "변화 없음"이고 같다고 읽힌다', () => {
    const d = buildStatDeltas('daily', getPeriodRange('daily', new Date(2026, 9, 19)), TODAY, delta(30, 0, 0))!
    expect(d.focus).toEqual({ text: '변화 없음', label: '전날과 집중 시간이 같아요', trend: 'same' })
    expect(d.flow).toEqual({ text: '변화 없음', label: '전날과 집중 횟수가 같아요', trend: 'same' })
    expect(d.completed.label).toBe('전날과 완료가 같아요')
    expect(buildStatDeltas('weekly', getPeriodRange('weekly', new Date(2026, 9, 12)), TODAY, delta(0, 0, 0))!.focus.label).toBe('전 주와 집중 시간이 같아요')
  })
})

describe('formatFocusTime', () => {
  it('멈춘 기록 형식으로 쓰고 분이 0이면 시간만 쓴다', () => {
    expect(formatFocusTime(4500)).toBe('1시간 15분')
    expect(formatFocusTime(8 * 3600)).toBe('8시간')
    expect(formatFocusTime(1500)).toBe('25분')
  })
})

describe('buildDailyGroups', () => {
  it('날마다 완료와 미완료를 나눠 센다', () => {
    const task = (id: string, isDone: boolean): TaskItem => ({
      id, title: id, date: '2026-10-19', isDone, focusSeconds: 0, focusTime: '0분', flowCount: 0, miniDay: 0,
    })
    const [first] = buildDailyGroups(
      { '2026-10-19': [task('a', true), task('b', false)] },
      getPeriodRange('weekly', new Date(2026, 9, 19)),
    )
    expect(first.taskCount).toBe(2)
    expect(first.completedTasks.map((t) => t.id)).toEqual(['a'])
    expect(first.incompleteTasks.map((t) => t.id)).toEqual(['b'])
  })
})

describe('buildMonthWeekGroups', () => {
  const t = (id: string, date: string, isDone: boolean): TaskItem => ({
    id, title: id, date, isDone, focusSeconds: 0, focusTime: '0분', flowCount: 0, miniDay: 1,
  })

  it('월요일로 시작하는 주로 묶되, 그달 날짜만 넣고 이름은 "10월 첫째 주"처럼 쓴다', () => {
    const month = getPeriodRange('monthly', new Date(2026, 9, 1))
    const days = buildDailyGroups(
      { '2026-10-02': [t('a', '2026-10-02', true)], '2026-10-19': [t('b', '2026-10-19', true), t('c', '2026-10-19', false)] },
      month,
    )
    const weeks = buildMonthWeekGroups(days)

    // 10월 1일은 목요일: 첫째 주는 1~4일(9월 28~30일은 넣지 않는다), 마지막은 26~31일
    expect(weeks.map((w) => [w.label, w.rangeLabel])).toEqual([
      ['10월 첫째 주', '1일–4일'],
      ['10월 둘째 주', '5일–11일'],
      ['10월 셋째 주', '12일–18일'],
      ['10월 넷째 주', '19일–25일'],
      ['10월 다섯째 주', '26일–31일'],
    ])
    expect(weeks[0].days.map((d) => d.dateKey)).toEqual(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'])
    expect(weeks[0]).toMatchObject({ startKey: '2026-10-01', endKey: '2026-10-04', taskCount: 1, completedCount: 1 })
    expect(weeks[3]).toMatchObject({ taskCount: 2, completedCount: 1 })
    expect(weeks[1].taskCount).toBe(0)
  })

  it('하루만 걸친 주는 그 날짜 하나로 쓴다', () => {
    // 2026년 3월 1일은 일요일
    const weeks = buildMonthWeekGroups(buildDailyGroups({}, getPeriodRange('monthly', new Date(2026, 2, 1))))
    expect(weeks[0]).toMatchObject({ label: '3월 첫째 주', rangeLabel: '1일' })
    expect(weeks).toHaveLength(6)
    expect(weeks[5]).toMatchObject({ label: '3월 여섯째 주', rangeLabel: '30일–31일' })
  })
})
