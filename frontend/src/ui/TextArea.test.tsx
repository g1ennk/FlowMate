import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { TextArea } from './TextArea'

describe('TextArea', () => {
  it('sunken 면에 3:1 테두리, 포커스 표시는 테두리에 붙은 선 하나(두 겹이 아니다)인 여러 줄 입력창이다', async () => {
    render(<TextArea aria-label="회고" />)
    const textarea = screen.getByRole('textbox', { name: '회고' })

    await userEvent.type(textarea, '첫 줄{enter}둘째 줄')

    expect(textarea).toHaveValue('첫 줄\n둘째 줄')
    expect(textarea).toHaveClass('bg-surface-sunken', 'rounded-control', 'border-text-tertiary', 'focus:border-text-primary')
    // 2px 띄운 전역 outline 대신 테두리 바로 바깥 ring 1px: 테두리와 합쳐 2px 선 하나로 보인다
    expect(textarea).toHaveClass('focus:outline-none', 'focus:ring-1', 'focus:ring-text-primary')
  })

  it('sunken 면 위 placeholder는 secondary로 읽힌다(tertiary는 sunken에서 쓰지 않는다)', () => {
    render(<TextArea aria-label="회고" placeholder="오늘 어땠어요?" />)

    expect(screen.getByRole('textbox', { name: '회고' })).toHaveClass('placeholder:text-text-secondary')
  })

  it('bare는 회색 면, 테두리, 둥근 상자, 안쪽 여백 없이 놓인 카드에 바로 쓴다(카드가 입력창이다)', () => {
    render(<TextArea aria-label="회고" bare placeholder="오늘 어땠어요?" />)
    const textarea = screen.getByRole('textbox', { name: '회고' })

    expect(textarea).toHaveClass('bg-transparent', 'p-0', 'border-0', 'focus:outline-none', 'placeholder:text-text-secondary')
    expect(textarea).not.toHaveClass('bg-surface-sunken', 'rounded-control', 'border', 'border-text-tertiary', 'px-3', 'py-3', 'focus:ring-1')
  })
})
