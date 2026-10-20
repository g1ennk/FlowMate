import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PeriodTabs } from './PeriodTabs'

describe('PeriodTabs', () => {
  it('회색 트랙 없이 놓이고, 고른 기간은 연두 면과 초록 글자로 보인다', () => {
    render(<PeriodTabs value="weekly" onChange={() => {}} />)

    const group = screen.getByRole('radiogroup', { name: '회고 기간' })
    expect(group).not.toHaveClass('bg-surface-sunken')
    const picked = screen.getByRole('radio', { name: '주간' })
    expect(picked).toHaveClass('bg-accent-muted', 'text-accent-text', 'font-semibold')
    expect(picked).not.toHaveClass('ring-1')
    expect(screen.getByRole('radio', { name: '일간' })).not.toHaveClass('bg-accent-muted')
  })
})
