import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { Button } from './Button'

describe('Button', () => {
  it('기본은 primary md이고 type="button"이다', () => {
    render(<Button>저장</Button>)
    const button = screen.getByRole('button', { name: '저장' })

    expect(button).toHaveAttribute('type', 'button')
    expect(button).toHaveClass('bg-accent-fill', 'text-on-accent', 'h-11', 'rounded-control', 'whitespace-nowrap')
  })

  it('variant와 size마다 정해진 모양을 쓴다', () => {
    render(
      <>
        <Button variant="secondary">보조</Button>
        <Button variant="ghost" size="sm">글자</Button>
        <Button variant="danger">삭제</Button>
        <Button variant="danger" filled>지우기</Button>
      </>,
    )

    expect(screen.getByRole('button', { name: '보조' })).toHaveClass('bg-surface-sunken', 'text-text-primary')
    expect(screen.getByRole('button', { name: '글자' })).toHaveClass('text-text-secondary', 'h-9')
    expect(screen.getByRole('button', { name: '글자' })).not.toHaveClass('bg-accent-fill')
    expect(screen.getByRole('button', { name: '삭제' })).toHaveClass('text-state-error-text')
    expect(screen.getByRole('button', { name: '삭제' })).not.toHaveClass('bg-state-error-strong')
    expect(screen.getByRole('button', { name: '지우기' })).toHaveClass('bg-state-error-strong', 'text-on-error')
  })

  it('sm은 보이는 높이 36에 터치 영역을 위아래 4px씩 넓혀 44로 맞춘다', () => {
    render(
      <>
        <Button size="sm">작게</Button>
        <Button>보통</Button>
      </>,
    )

    expect(screen.getByRole('button', { name: '작게' })).toHaveClass('h-9', 'relative', 'after:absolute', 'after:inset-x-0', 'after:-inset-y-1')
    expect(screen.getByRole('button', { name: '보통' })).not.toHaveClass('after:-inset-y-1')
  })

  it('timer tone은 timer 토큰만 쓴다', () => {
    render(<Button tone="timer">시작</Button>)

    expect(screen.getByRole('button', { name: '시작' })).toHaveClass('bg-timer-accent', 'text-timer-on-accent')
  })

  it('timer tone은 확인 시트의 채운 danger도 타이머 포커스 링을 쓴다(테마 포커스 링이 새지 않는다)', () => {
    render(
      <>
        <Button tone="timer" variant="danger" filled>초기화</Button>
        <Button tone="timer">시작</Button>
      </>,
    )

    for (const name of ['초기화', '시작']) {
      const button = screen.getByRole('button', { name })
      expect(button).toHaveClass('outline-timer-focus-ring')
      expect(button.className).not.toMatch(/(^|\s)(bg|text)-(accent|surface-|text-)/)
    }
    expect(screen.getByRole('button', { name: '초기화' })).toHaveClass('bg-state-error-strong')
  })

  it('pill이면 모서리만 알약(rounded-full)으로 바꾸고 rounded-control은 쓰지 않는다', () => {
    render(<Button pill size="sm">저장</Button>)
    const button = screen.getByRole('button', { name: '저장' })

    expect(button).toHaveClass('rounded-full', 'bg-accent-fill', 'h-9')
    expect(button).not.toHaveClass('rounded-control')
  })

  it('비활성이면 누를 수 없다', async () => {
    const onClick = vi.fn()
    render(<Button disabled onClick={onClick}>저장</Button>)

    await userEvent.click(screen.getByRole('button', { name: '저장' }))

    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled()
    expect(onClick).not.toHaveBeenCalled()
  })

  it('to를 주면 같은 모양의 링크로 그린다', () => {
    render(
      <MemoryRouter>
        <Button to="/todos">돌아가기</Button>
        <Button>버튼</Button>
      </MemoryRouter>,
    )
    const link = screen.getByRole('link', { name: '돌아가기' })

    expect(link).toHaveAttribute('href', '/todos')
    expect(link.className).toBe(screen.getByRole('button', { name: '버튼' }).className)
  })
})
