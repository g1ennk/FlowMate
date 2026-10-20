import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CloseIcon } from './Icons'
import { IconButton } from './IconButton'

describe('IconButton', () => {
  it('label을 접근 이름으로 쓰고 아이콘은 읽지 않는다', () => {
    render(<IconButton label="닫기"><CloseIcon /></IconButton>)
    const button = screen.getByRole('button', { name: '닫기' })

    expect(button).toHaveAttribute('type', 'button')
    expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('보이는 크기는 32이고 터치 영역은 의사 요소로 48까지 넓힌다', () => {
    render(<IconButton label="닫기"><CloseIcon /></IconButton>)

    expect(screen.getByRole('button', { name: '닫기' })).toHaveClass('h-8', 'w-8', 'relative', 'after:absolute', 'after:-inset-2')
  })

  it('timer tone은 어두운 면용 글자색을 쓴다', () => {
    render(<IconButton label="닫기" tone="timer"><CloseIcon /></IconButton>)

    expect(screen.getByRole('button', { name: '닫기' })).toHaveClass('text-timer-btn-text')
  })

  it('비활성이면 누를 수 없다', async () => {
    const onClick = vi.fn()
    render(<IconButton label="닫기" disabled onClick={onClick}><CloseIcon /></IconButton>)

    await userEvent.click(screen.getByRole('button', { name: '닫기' }))

    expect(onClick).not.toHaveBeenCalled()
  })
})
