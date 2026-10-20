import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StatsSummary } from './StatsSummary'

describe('StatsSummary', () => {
  it('바꾸기 전 통계 카드 모양이다: 세 칸을 세로선으로 나누고, 칸마다 라벨 아래 초록 숫자를 둔다', () => {
    render(<StatsSummary totalFocusSeconds={4500} totalFlows={3} completedCount={2} />)

    const value = screen.getByText('1시간 15분')
    // 숫자는 accent-text(본문 대비 4.5:1 이상인 초록)
    expect(value).toHaveClass('text-accent-text')
    expect(screen.getByText('3회')).toHaveClass('text-accent-text')
    expect(screen.getByText('2개')).toHaveClass('text-accent-text')
    // 라벨이 숫자 위에 온다
    const label = screen.getByText('집중 시간')
    expect(label.compareDocumentPosition(value) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByText('집중 횟수')).toBeInTheDocument()
    expect(screen.getByText('완료')).toBeInTheDocument()
    // 칸 사이 세로선
    expect(label.closest('[data-stat-grid]')).toHaveClass('divide-x')
  })

  it('집중 횟수 점은 두지 않고 숫자만 쓴다', () => {
    const { container } = render(<StatsSummary totalFocusSeconds={45000} totalFlows={15} completedCount={2} />)

    expect(container.querySelectorAll('[data-focus-dot]')).toHaveLength(0)
    expect(screen.getByText('15회')).toBeInTheDocument()
    expect(screen.queryByText('+3')).not.toBeInTheDocument()
  })

  it('카드 안에 "회고 쓰기" 같은 이동 링크를 두지 않는다', () => {
    render(<StatsSummary totalFocusSeconds={4500} totalFlows={3} completedCount={2} />)

    expect(screen.queryByRole('button', { name: /회고 (쓰기|보기)/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/회고 (쓰기|보기)/)).not.toBeInTheDocument()
  })

  it('끝난 기간이면 칸마다 숫자 아래 증감을 둔다: 늘면 초록, 줄거나 같으면 무채색, 비교 대상은 접근성 이름으로 읽힌다', () => {
    render(
      <StatsSummary
        totalFocusSeconds={600}
        totalFlows={1}
        completedCount={2}
        deltas={{
          focus: { text: '-55분', label: '전날보다 집중 시간 55분 줄었어요', trend: 'down' },
          flow: { text: '변화 없음', label: '전날과 집중 횟수가 같아요', trend: 'same' },
          completed: { text: '+1개', label: '전날보다 완료 1개 늘었어요', trend: 'up' },
        }}
      />,
    )

    const down = screen.getByText('-55분')
    expect(down).toHaveAttribute('aria-hidden', 'true')
    expect(down.parentElement).toHaveClass('text-text-secondary')
    expect(down.parentElement?.className).not.toMatch(/error/)
    expect(screen.getByText('전날보다 집중 시간 55분 줄었어요')).toHaveClass('sr-only')
    expect(screen.getByText('+1개').parentElement).toHaveClass('text-accent-text')
    expect(screen.getByText('변화 없음').parentElement).toHaveClass('text-text-secondary')
    // 증감은 그 칸의 숫자 아래에 온다
    const value = screen.getByText('10분')
    expect(value.compareDocumentPosition(down) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('증감이 없으면(진행 중인 기간) 증감 줄을 두지 않는다', () => {
    const { container } = render(<StatsSummary totalFocusSeconds={600} totalFlows={1} completedCount={0} />)
    expect(container.textContent).not.toMatch(/[+-]\d|변화 없음/)
  })

  it('기록이 없으면 다른 묶음처럼 카드 한 장 안에 한 줄로 말한다', () => {
    const { rerender } = render(<StatsSummary totalFocusSeconds={0} totalFlows={0} completedCount={0} isCurrentPeriod />)
    expect(screen.getByText('아직 집중 기록이 없어요').closest('.rounded-card')).toHaveClass('p-card')

    rerender(<StatsSummary totalFocusSeconds={0} totalFlows={0} completedCount={0} isCurrentPeriod={false} />)
    expect(screen.getByText('이 기간에는 집중 기록이 없어요')).toBeInTheDocument()
  })
})
