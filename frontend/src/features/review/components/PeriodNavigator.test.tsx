import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PeriodNavigator } from './PeriodNavigator'

const renderNav = (isCurrent = true) =>
  render(
    <PeriodNavigator
      period="daily"
      label="10월 20일 화요일"
      isCurrent={isCurrent}
      onJumpToCurrent={vi.fn()}
      onPrev={vi.fn()}
      onNext={vi.fn()}
    />,
  )

describe('PeriodNavigator', () => {
  it('이전 화살표가 왼쪽 끝, 날짜가 가운데, 다음 화살표가 오른쪽 끝에 온다', () => {
    renderNav()
    const prev = screen.getByRole('button', { name: '이전 날' })
    const label = screen.getByText('10월 20일 화요일')
    const next = screen.getByRole('button', { name: '다음 날' })

    expect(prev.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(label.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(label.closest('.flex-1')).toHaveClass('justify-center')
  })

  it('지금 기간이 아니면 날짜 옆 가운데 묶음에 지금으로 돌아가는 버튼을 둔다', () => {
    renderNav(false)
    const jump = screen.getByRole('button', { name: '오늘' })
    expect(jump.parentElement).toBe(screen.getByText('10월 20일 화요일').parentElement)
  })
})
