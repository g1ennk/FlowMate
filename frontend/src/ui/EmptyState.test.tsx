import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { EmptyState } from './EmptyState'

describe('EmptyState', () => {
  it('한 줄 문구를 secondary로 보여 준다', () => {
    render(<EmptyState message="아직 할 일이 없어요." />)

    expect(screen.getByText('아직 할 일이 없어요.')).toHaveClass('text-text-secondary')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('액션은 ghost 버튼이다', async () => {
    const onAction = vi.fn()
    render(<EmptyState message="아직 할 일이 없어요." actionLabel="할 일 추가" onAction={onAction} />)

    await userEvent.click(screen.getByRole('button', { name: '할 일 추가' }))

    expect(onAction).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: '할 일 추가' })).not.toHaveClass('bg-accent-fill')
  })
})
