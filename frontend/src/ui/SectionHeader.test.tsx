import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SectionHeader } from './SectionHeader'

describe('SectionHeader', () => {
  it('제목은 16/600 h2다', () => {
    render(<SectionHeader title="뽀모도로" />)

    expect(screen.getByRole('heading', { level: 2, name: '뽀모도로' })).toHaveClass('text-base', 'font-semibold', 'text-text-primary')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('액션은 ghost sm 버튼이다', async () => {
    const onAction = vi.fn()
    render(<SectionHeader title="뽀모도로" actionLabel="기본값 복원" onAction={onAction} />)
    const action = screen.getByRole('button', { name: '기본값 복원' })

    await userEvent.click(action)

    expect(onAction).toHaveBeenCalledTimes(1)
    expect(action).toHaveClass('h-9', 'text-text-secondary')
  })

  it('actionDisabled면 액션을 누를 수 없다', () => {
    render(<SectionHeader title="뽀모도로" actionLabel="기본값 복원" onAction={() => {}} actionDisabled />)

    expect(screen.getByRole('button', { name: '기본값 복원' })).toBeDisabled()
  })

  it('시트 안 묶음 제목은 size="sm"(14/600)이고 h3, id를 줄 수 있다', () => {
    render(<SectionHeader title="짧은 휴식" size="sm" as="h3" id="break-short-title" />)

    const heading = screen.getByRole('heading', { level: 3, name: '짧은 휴식' })
    expect(heading).toHaveAttribute('id', 'break-short-title')
    expect(heading).toHaveClass('text-sm', 'font-semibold', 'text-text-secondary')
  })

  it('타이머 시트에서는 timer 토큰만 쓰고 오른쪽에 값 글자를 둘 수 있다', () => {
    render(<SectionHeader title="음악과 환경음" size="sm" as="h3" tone="timer" meta="반반" />)

    const heading = screen.getByRole('heading', { level: 3, name: '음악과 환경음' })
    expect(heading.className).toMatch(/text-timer-/)
    expect(heading.className).not.toMatch(/text-text-/)
    expect(screen.getByText('반반').className).toMatch(/text-timer-/)
  })
})
