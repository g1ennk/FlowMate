import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { TextField } from './TextField'

describe('TextField', () => {
  it('label과 입력창을 연결한다', async () => {
    render(<TextField label="구간 이름" defaultValue="" />)
    const input = screen.getByRole('textbox', { name: '구간 이름' })

    await userEvent.type(input, '오전')

    expect(input).toHaveValue('오전')
    expect(input).toHaveClass('bg-surface-sunken', 'rounded-control', 'focus:border-text-primary', 'focus:ring-1')
  })

  it('포커스 전 테두리는 3:1을 넘는 text-tertiary, 포커스 표시는 검정 테두리에 붙은 ring 1(선 하나, 2px)로 메모, 회고 입력과 같다(§3-5, §10)', () => {
    render(<TextField aria-label="할 일" placeholder="할 일 이름" />)
    const input = screen.getByRole('textbox', { name: '할 일' })

    expect(input).toHaveClass('border-text-tertiary', 'focus:ring-1', 'focus:ring-text-primary')
    expect(input.className).not.toMatch(/border-border-strong|ring-focus-ring\/\d+/)
  })

  it('sunken 면 위 placeholder는 secondary다(tertiary는 sunken에서 쓰지 않는다)', () => {
    render(<TextField aria-label="할 일" placeholder="할 일 이름" />)

    expect(screen.getByRole('textbox', { name: '할 일' })).toHaveClass('placeholder:text-text-secondary')
  })

  it('label 없이 aria-label로 이름을 줄 수 있다', () => {
    render(<TextField aria-label="할 일" />)

    expect(screen.getByRole('textbox', { name: '할 일' })).toBeInTheDocument()
  })

  it('error는 입력창 설명으로 읽히고 invalid로 표시한다', () => {
    render(<TextField label="구간 이름" error="이름을 입력해 주세요." />)
    const input = screen.getByRole('textbox', { name: '구간 이름' })

    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('이름을 입력해 주세요.')
  })

  it('비활성이면 입력할 수 없다', () => {
    render(<TextField label="구간 이름" disabled />)

    expect(screen.getByRole('textbox', { name: '구간 이름' })).toBeDisabled()
  })

  it('오류 상태에서는 빨간 테두리 밖에 검정 2px 링을 둬 포커스가 또렷하다, 평소는 ring 1 그대로(Task 24)', () => {
    const { rerender } = render(<TextField aria-label="이름" error="필수" />)
    const input = screen.getByRole('textbox', { name: '이름' })

    expect(input).toHaveClass('border-state-error-text', 'focus:ring-2', 'focus:ring-text-primary')
    expect(input).not.toHaveClass('focus:ring-1')

    rerender(<TextField aria-label="이름" />)
    expect(screen.getByRole('textbox', { name: '이름' })).toHaveClass('focus:ring-1')
    expect(screen.getByRole('textbox', { name: '이름' })).not.toHaveClass('focus:ring-2')
  })
})
