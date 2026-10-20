import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { formatDateKey } from '../lib/time'
import { Calendar, CalendarDayGrid, CalendarMonthGrid, type ViewMode } from './Calendar'

const SELECTED = new Date(2026, 9, 19)
// 오늘이 아닌 날
const OTHER_DAY = (() => {
  const d = new Date()
  d.setDate(d.getDate() - 3)
  return d
})()

describe('Calendar 헤더', () => {
  it('제목은 연도와 달("2026년 10월")이다', () => {
    render(<Calendar selectedDate={SELECTED} onSelectDate={() => {}} onMonthChange={() => {}} />)

    expect(screen.getByRole('heading', { name: '2026년 10월' })).toBeInTheDocument()
  })

  it('이전/다음 버튼 이름이 보기 단위를 따른다', async () => {
    const onMonthChange = vi.fn()
    render(<Calendar selectedDate={SELECTED} onSelectDate={() => {}} onMonthChange={onMonthChange} />)

    await userEvent.click(screen.getByRole('button', { name: '다음 달' }))
    expect(onMonthChange).toHaveBeenLastCalledWith(new Date(2026, 10, 1))
    expect(screen.getByRole('button', { name: '이전 달' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('radio', { name: '주 보기' }))
    expect(screen.getByRole('button', { name: '이전 주' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다음 주' })).toBeInTheDocument()
  })

  it('월/주 전환은 radiogroup이고 방향키로도 바꾼다', () => {
    const onViewModeChange = vi.fn()
    render(
      <Calendar
        selectedDate={SELECTED}
        onSelectDate={() => {}}
        onMonthChange={() => {}}
        onViewModeChange={onViewModeChange}
      />,
    )

    expect(screen.getByRole('radiogroup', { name: '달력 보기' })).toBeInTheDocument()
    const month = screen.getByRole('radio', { name: '월 보기' })
    expect(month).toHaveAttribute('aria-checked', 'true')
    expect(month).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('radio', { name: '주 보기' })).toHaveAttribute('tabindex', '-1')

    fireEvent.keyDown(month, { key: 'ArrowRight' })
    expect(onViewModeChange).toHaveBeenLastCalledWith('week')
    expect(screen.getByRole('radio', { name: '주 보기' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: '주 보기' })).toHaveFocus()
  })

  it('오늘 버튼은 오늘이 아닌 날을 볼 때만 보이는 바탕 없는 초록 글자 버튼이다', async () => {
    const onSelectDate = vi.fn()
    const { rerender } = render(
      <Calendar selectedDate={new Date()} onSelectDate={onSelectDate} onMonthChange={() => {}} />,
    )
    // 오늘을 고른 동안에는 숨긴다(눌러도 할 일이 없다). 자리는 남겨 헤더가 움직이지 않는다
    expect(screen.queryByRole('button', { name: '오늘' })).not.toBeInTheDocument()
    const hidden = screen.getByText('오늘', { selector: 'button' })
    expect(hidden).toHaveAttribute('aria-hidden', 'true')
    expect(hidden).toHaveClass('invisible')
    expect(hidden).toHaveAttribute('tabindex', '-1')

    rerender(<Calendar selectedDate={OTHER_DAY} onSelectDate={onSelectDate} onMonthChange={() => {}} />)
    const todayButton = screen.getByRole('button', { name: '오늘' })
    expect(todayButton).not.toHaveClass('invisible')
    expect(todayButton).not.toHaveAttribute('tabindex')
    expect(todayButton).toHaveClass('text-accent-text')
    expect(todayButton.className).not.toMatch(/(^| )bg-/)

    await userEvent.click(todayButton)
    expect(onSelectDate).toHaveBeenCalledTimes(1)
    expect(formatDateKey(onSelectDate.mock.calls[0][0] as Date)).toBe(formatDateKey(new Date()))
  })

  it('헤더의 버튼은 보이는 크기는 작아도 터치 영역(after)을 넓힌다', () => {
    render(<Calendar selectedDate={OTHER_DAY} onSelectDate={() => {}} onMonthChange={() => {}} />)

    const targets = [
      screen.getByRole('button', { name: '오늘' }),
      screen.getByRole('button', { name: '이전 달' }),
      screen.getByRole('button', { name: '다음 달' }),
      screen.getByRole('radio', { name: '월 보기' }),
      screen.getByRole('radio', { name: '주 보기' }),
    ]
    for (const target of targets) {
      expect(target).toHaveClass('relative')
      expect(target.className).toMatch(/after:absolute/)
    }
  })

  it('달력은 목록 카드와 같은 둥근 테두리 카드 안에 있다(그림자 없음)', () => {
    const { container } = render(
      <Calendar selectedDate={SELECTED} onSelectDate={() => {}} onMonthChange={() => {}} />,
    )

    expect(container.firstElementChild).toHaveClass('rounded-card', 'border-card-border', 'bg-surface-card', 'p-card')
    expect(container.firstElementChild).not.toHaveClass('shadow-sm')
  })
})

describe('Calendar 보기 전환', () => {
  it('월 보기에서 날짜를 골라도 주 보기로 접지 않는다', async () => {
    const onSelectDate = vi.fn()
    const onViewModeChange = vi.fn()
    render(
      <Calendar
        selectedDate={new Date(2025, 2, 10)}
        defaultViewMode="month"
        onSelectDate={onSelectDate}
        onMonthChange={() => {}}
        onViewModeChange={onViewModeChange}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: /^2025년 3월 20일 / }))

    expect(onSelectDate).toHaveBeenCalledTimes(1)
    expect(onViewModeChange).not.toHaveBeenCalled()
    expect(screen.getByRole('radio', { name: '월 보기' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('button', { name: /^2025년 3월 31일 / })).toBeInTheDocument()
  })

  it('보기를 바꾸면 부모가 저장할 수 있게 알리고, 부모가 준 보기를 그대로 따른다', async () => {
    const onViewModeChange = vi.fn()
    function Harness() {
      const [mode, setMode] = useState<ViewMode>('month')
      return (
        <Calendar
          selectedDate={new Date(2025, 2, 10)}
          viewMode={mode}
          onViewModeChange={(next) => {
            onViewModeChange(next)
            setMode(next)
          }}
          onSelectDate={() => {}}
          onMonthChange={() => {}}
        />
      )
    }
    render(<Harness />)

    await userEvent.click(screen.getByRole('radio', { name: '주 보기' }))
    expect(onViewModeChange).toHaveBeenLastCalledWith('week')
    expect(screen.getByRole('radio', { name: '주 보기' })).toHaveAttribute('aria-checked', 'true')
    // 주 보기는 고른 날의 한 주(월~일) 7칸만 그린다
    expect(screen.getByRole('button', { name: /^2025년 3월 16일 / })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^2025년 3월 17일 / })).not.toBeInTheDocument()
  })
})

describe('Calendar 날짜 칸', () => {
  it('할 일이 있는 날은 숫자 아래 남은 개수(모두 끝나면 ✓)만 두고 바탕은 칠하지 않는다', () => {
    // 오늘과 겹치지 않는 지난 주(2025년 3월 10일 월요일)
    render(
      <Calendar
        selectedDate={new Date(2025, 2, 10)}
        viewMode="week"
        onSelectDate={() => {}}
        onMonthChange={() => {}}
        markedDates={{
          '2025-03-11': { done: 1, total: 18 },
          '2025-03-12': { done: 3, total: 3 },
        }}
      />,
    )

    const pending = screen.getByRole('button', { name: '2025년 3월 11일 화요일 남은 할 일 17개' })
    const done = screen.getByRole('button', { name: '2025년 3월 12일 수요일 모두 완료' })
    const empty = screen.getByRole('button', { name: '2025년 3월 13일 목요일' })

    expect(within(pending).getByText('17')).toBeInTheDocument()
    expect(within(done).getByText('✓')).toHaveClass('text-accent-text')
    for (const cell of [pending, done, empty]) expect(cell.className).not.toMatch(/(^| )bg-/)
  })

  it('오늘은 숫자 위에 작은 "오늘"을 두고, 고른 날은 초록 둥근 사각 테두리다', () => {
    const today = new Date()
    render(<Calendar selectedDate={today} viewMode="week" onSelectDate={() => {}} onMonthChange={() => {}} />)

    const cell = screen.getByRole('button', { name: /.요일 오늘$/ })
    expect(cell).toHaveAttribute('aria-pressed', 'true')
    expect(cell).toHaveAccessibleName(new RegExp(`^${today.getMonth() + 1}월 ${today.getDate()}일 .요일 오늘$`))
    expect(cell).toHaveClass('rounded-xl', 'ring-2', 'ring-accent')
    expect(cell.className).not.toMatch(/(^| )bg-/)
    const label = within(cell).getByText('오늘')
    expect(label).toHaveClass('text-accent-text')
    expect(label.compareDocumentPosition(within(cell).getByText(String(today.getDate()))) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('요일 머리 줄은 주 보기와 월 보기 모두 있고, 토요일은 파랑, 일요일은 빨강이다', () => {
    const { rerender } = render(
      <Calendar selectedDate={new Date(2025, 2, 10)} viewMode="week" onSelectDate={() => {}} onMonthChange={() => {}} />,
    )

    for (const mode of ['week', 'month'] as const) {
      rerender(<Calendar selectedDate={new Date(2025, 2, 10)} viewMode={mode} onSelectDate={() => {}} onMonthChange={() => {}} />)
      const header = (letter: string) => screen.getAllByText(letter).find((el) => !el.closest('button'))!
      expect(header('토')).toHaveClass('text-state-info-text')
      expect(header('일')).toHaveClass('text-state-error-text')
      expect(header('화')).toHaveClass('text-text-tertiary')
      // 날짜 칸 안에는 요일 글자가 없다
      expect(within(screen.getByRole('button', { name: '2025년 3월 11일 화요일' })).queryByText('화')).not.toBeInTheDocument()
    }

    // 주말 날짜 숫자도 같은 색이다(고르지 않은 날)
    expect(screen.getByRole('button', { name: '2025년 3월 15일 토요일' })).toHaveClass('text-state-info-text')
    expect(screen.getByRole('button', { name: '2025년 3월 16일 일요일' })).toHaveClass('text-state-error-text')
    expect(screen.getByRole('button', { name: '2025년 3월 13일 목요일' })).toHaveClass('text-text-secondary')
  })

  it('날짜 칸은 보이는 크기가 작아도 터치 영역을 넓힌다', () => {
    render(<Calendar selectedDate={new Date(2025, 2, 10)} viewMode="week" onSelectDate={() => {}} onMonthChange={() => {}} />)

    const cell = screen.getByRole('button', { name: '2025년 3월 12일 수요일' })
    expect(cell).toHaveClass('aspect-square', 'relative')
    expect(cell.className).toMatch(/after:absolute/)
  })
})

describe('CalendarDayGrid', () => {
  it('월 그리드만 따로 쓸 수 있다', async () => {
    const onSelect = vi.fn()
    render(
      <CalendarDayGrid
        days={[new Date(2026, 10, 1), new Date(2026, 10, 2)]}
        selectedDateKey="2026-11-02"
        onSelect={onSelect}
      />,
    )

    for (const weekday of ['월', '화', '수', '목', '금', '토', '일']) expect(screen.getByText(weekday)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /11월 2일 월요일/ })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: /11월 1일 일요일/ }))
    expect(formatDateKey(onSelect.mock.calls[0][0] as Date)).toBe('2026-11-01')
  })
})

describe('CalendarMonthGrid picker (날짜 선택 시트)', () => {
  it('고른 날은 초록 테두리 원이고, 오늘은 숫자 아래 "오늘"만 두며 면을 칠하지 않는다', () => {
    render(
      <CalendarMonthGrid
        variant="picker"
        month={new Date(2026, 10, 1)}
        selectedDateKey="2026-11-05"
        todayDateKey="2026-11-03"
        onSelect={() => {}}
        showIndicators={false}
      />,
    )

    const selected = screen.getByRole('button', { name: /^11월 5일 / })
    expect(selected).toHaveAttribute('aria-pressed', 'true')
    expect(selected).toHaveClass('rounded-full', 'ring-2', 'ring-accent')
    expect(selected.className).not.toMatch(/(^| )bg-/)

    const today = screen.getByRole('button', { name: /^11월 3일 .요일 오늘$/ })
    expect(today.className).not.toMatch(/(^| )bg-/)
    const label = within(today).getByText('오늘')
    expect(within(today).getByText('3').compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    expect(screen.getByRole('button', { name: /^11월 7일 토요일/ })).toHaveClass('text-state-info-text')
    expect(screen.getByRole('button', { name: /^11월 8일 일요일/ })).toHaveClass('text-state-error-text')
    expect(screen.getByRole('button', { name: /^11월 6일 금요일/ })).toHaveClass('text-text-primary')
  })
})

describe('Calendar 오늘 버튼 포커스', () => {
  it('오늘을 누르면 버튼이 숨어도 포커스가 body로 떨어지지 않고 연월 제목으로 간다', () => {
    render(<Calendar selectedDate={OTHER_DAY} onSelectDate={() => {}} onMonthChange={() => {}} />)
    const today = screen.getByRole('button', { name: '오늘' })
    today.focus()
    fireEvent.click(today)
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 2 }))
  })
})
