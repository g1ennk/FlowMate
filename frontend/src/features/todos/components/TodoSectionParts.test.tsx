import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SectionGuideCard } from './TodoSectionParts'

describe('SectionGuideCard', () => {
  it('위아래 간격이 같은 토큰(12)이다: 머리 아래 첫 할 일 행의 윗 여백과 구분선까지의 아래 여백(Task 24)', () => {
    render(<SectionGuideCard greeting="좋은 오후예요" question="무엇을 할까요?" ctaLabel="오후에 추가" onAdd={() => {}} />)
    const card = screen.getByText('좋은 오후예요').closest('div')!

    expect(card).toHaveClass('mt-card-item', 'mb-card-item')
  })
})
