import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { TaskItem } from '../reviewTypes'
import { buildDailyGroups, getPeriodRange } from '../reviewUtils'
import { TimelineList } from './TimelineList'

const MINI_DAYS = [
  { id: 0, label: '미분류' },
  { id: 1, label: '오전' },
  { id: 2, label: '오후' },
  { id: 3, label: '저녁' },
]

function task(id: string, date: string, isDone: boolean, focusSeconds = 0): TaskItem {
  return { id, title: id, date, isDone, focusSeconds, focusTime: `${Math.floor(focusSeconds / 60)}분`, flowCount: 0, miniDay: 1 }
}

// 이번 주: 2026-10-19(월) ~ 25(일), 오늘은 21일(수)
const WEEK = getPeriodRange('weekly', new Date(2026, 9, 21))
const TODAY = '2026-10-21'

describe('TimelineList', () => {
  it('주간: 아직 오지 않은 날은 숨기고, 기록 없는 날은 한 줄, 기록 있는 날 머리는 "완료/전체"다', () => {
    const groups = buildDailyGroups(
      { '2026-10-19': [task('보고서', '2026-10-19', true), task('운동', '2026-10-19', false)], '2026-10-21': [task('장보기', '2026-10-21', true)] },
      WEEK,
    )
    render(<TimelineList title="타임라인" viewMode="weekly" groups={groups} miniDayLabels={MINI_DAYS} todayKey={TODAY} isPastPeriod={false} />)

    expect(screen.queryByText(/10월 22일/)).not.toBeInTheDocument()
    expect(screen.queryByText(/10월 25일/)).not.toBeInTheDocument()
    const emptyDay = screen.getByText('10월 20일 화요일')
    expect(emptyDay.parentElement).toHaveTextContent('기록 없음')
    expect(screen.getByRole('button', { name: /10월 19일 월요일.*1\/2 완료/ })).toHaveAttribute('aria-expanded', 'false')
    // 진행 중인 주에서는 오늘만 펼친다
    expect(screen.getByRole('button', { name: /10월 21일 수요일.*1\/1 완료/ })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: /장보기/ })).toBeInTheDocument()
  })

  it('지난 기간은 기록 있는 날을 처음부터 펼친다', () => {
    const lastWeek = getPeriodRange('weekly', new Date(2026, 9, 14))
    const groups = buildDailyGroups(
      { '2026-10-12': [task('보고서', '2026-10-12', true)], '2026-10-15': [task('운동', '2026-10-15', false)] },
      lastWeek,
    )
    render(<TimelineList title="타임라인" viewMode="weekly" groups={groups} miniDayLabels={MINI_DAYS} todayKey={TODAY} isPastPeriod />)

    expect(screen.getByRole('button', { name: /10월 12일/ })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: /10월 15일/ })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: /보고서/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /운동/ })).toBeInTheDocument()
  })

  it('월간은 그달 날짜만 담은 주로 묶고(주 → 날짜 2단), 미니데이 구분은 두지 않는다', () => {
    const month = getPeriodRange('monthly', new Date(2026, 9, 1))
    const groups = buildDailyGroups(
      {
        '2026-10-02': [task('보고서', '2026-10-02', true)],
        '2026-10-19': [task('운동', '2026-10-19', true), task('독서', '2026-10-19', false)],
        '2026-10-21': [task('장보기', '2026-10-21', false)],
      },
      month,
    )
    render(<TimelineList title="타임라인" viewMode="monthly" groups={groups} miniDayLabels={MINI_DAYS} todayKey={TODAY} isPastPeriod={false} />)

    // 지난달 날짜(9/28~30)는 넣지 않고, 아직 오지 않은 주(26일~)는 숨긴다
    expect(screen.queryByText(/9월|9\/2/)).not.toBeInTheDocument()
    expect(screen.queryByText(/다섯째 주/)).not.toBeInTheDocument()
    const first = screen.getByRole('button', { name: /10월 첫째 주.*1일–4일.*1\/1 완료/ })
    // 진행 중인 달은 오늘이 든 주만 펼친다
    expect(first).toHaveAttribute('aria-expanded', 'false')
    const current = screen.getByRole('button', { name: /10월 넷째 주.*19일–25일.*1\/3 완료/ })
    expect(current).toHaveAttribute('aria-expanded', 'true')
    // 기록 없는 주는 한 줄
    expect(screen.getByText('10월 둘째 주').closest('div')).toHaveTextContent('기록 없음')

    // 펼친 주 안에는 기록 있는 날짜만 날짜 이름 아래 할 일을 둔다
    expect(screen.getByText('10월 19일 월요일')).toBeInTheDocument()
    expect(screen.getByText('10월 21일 수요일')).toBeInTheDocument()
    expect(screen.queryByText('10월 20일 화요일')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /운동/ })).toBeInTheDocument()
    expect(screen.queryByText('오전')).not.toBeInTheDocument()
    expect(screen.queryByText(/주차/)).not.toBeInTheDocument()
  })

  it('지난 달은 기록 있는 주를 처음부터 펼친다', () => {
    const month = getPeriodRange('monthly', new Date(2026, 8, 1))
    const groups = buildDailyGroups(
      { '2026-09-03': [task('보고서', '2026-09-03', true)], '2026-09-20': [task('운동', '2026-09-20', true)] },
      month,
    )
    render(<TimelineList title="타임라인" viewMode="monthly" groups={groups} miniDayLabels={MINI_DAYS} todayKey={TODAY} isPastPeriod />)

    expect(screen.getByRole('button', { name: /9월 첫째 주/ })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: /9월 셋째 주/ })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: /보고서/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /운동/ })).toBeInTheDocument()
  })

  it('할 일 행은 44px 이상이고 세션 상세로 가는 화살표가 있으며, 완료는 체크 아이콘으로만 표시한다', async () => {
    const onSelect = vi.fn()
    const groups = buildDailyGroups({ '2026-10-21': [task('장보기', TODAY, true, 1500), task('운동', TODAY, false)] }, WEEK)
    render(<TimelineList title="타임라인" viewMode="weekly" groups={groups} miniDayLabels={MINI_DAYS} todayKey={TODAY} isPastPeriod={false} onSelectTask={onSelect} />)

    const done = screen.getByRole('button', { name: /장보기/ })
    expect(done).toHaveClass('min-h-11')
    expect(done).toHaveAccessibleName(/완료/)
    expect(within(done).getByText('25분')).toBeInTheDocument()
    expect(done.querySelectorAll('svg')).toHaveLength(2)
    expect(screen.getByRole('button', { name: /운동/ })).not.toHaveAccessibleName(/완료/)

    await userEvent.setup().click(done)
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: '장보기' }))
  })

  it('기록이 하나도 없으면 한 줄로 말한다', () => {
    render(<TimelineList title="타임라인" viewMode="weekly" groups={buildDailyGroups({}, WEEK)} miniDayLabels={MINI_DAYS} todayKey={TODAY} isPastPeriod={false} />)
    expect(screen.getByText('이 기간에는 할 일 기록이 없어요')).toBeInTheDocument()
  })
})
