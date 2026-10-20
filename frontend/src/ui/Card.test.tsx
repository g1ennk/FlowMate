import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Card } from './Card'

describe('Card', () => {
  it('카드 면, 반경, 테두리 토큰을 쓰고 그림자는 없다', () => {
    render(<Card>내용</Card>)
    const card = screen.getByText('내용')

    expect(card).toHaveClass('bg-surface-card', 'rounded-card', 'p-card', 'border', 'border-card-border')
    expect(card.className).not.toMatch(/shadow/)
  })

  it('padding="none"이면 안쪽 여백을 두지 않는다', () => {
    render(<Card padding="none">목록</Card>)

    expect(screen.getByText('목록')).not.toHaveClass('p-card')
  })
})
