import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PlayIcon } from './Icons'
import { TimerControl } from './TimerControl'

describe('TimerControl', () => {
  it('원 아래 caption 라벨이 버튼의 이름이다', async () => {
    const onClick = vi.fn()
    render(<TimerControl label="시작" icon={<PlayIcon />} onClick={onClick} />)

    await userEvent.click(screen.getByRole('button', { name: '시작' }))

    expect(onClick).toHaveBeenCalledTimes(1)
    expect(screen.getByText('시작')).toHaveClass('text-xs')
  })

  it('primary는 timer-accent, neutral은 timer-btn 원을 쓰고, 버튼 자체가 원이다', () => {
    render(
      <>
        <TimerControl label="일시정지" emphasis="primary" icon={<PlayIcon />} />
        <TimerControl label="완료" icon={<PlayIcon />} />
      </>,
    )
    const primary = screen.getByRole('button', { name: '일시정지' })
    const neutral = screen.getByRole('button', { name: '완료' })

    // 버튼의 배경이 곧 원이라 주 행동을 버튼 단위로 셀 수 있다(측정 도구 H2, H6)
    expect(primary).toHaveAttribute('data-emphasis', 'primary')
    expect(neutral).toHaveAttribute('data-emphasis', 'neutral')
    expect(primary).toHaveClass('h-14', 'w-14', 'rounded-full', 'bg-timer-accent', 'text-timer-on-accent')
    expect(neutral).toHaveClass('h-14', 'w-14', 'bg-timer-btn', 'text-timer-btn-text')
  })

  it('비활성이면 누를 수 없다', () => {
    render(<TimerControl label="시작" icon={<PlayIcon />} disabled />)

    expect(screen.getByRole('button', { name: '시작' })).toBeDisabled()
    // caption도 원과 같이 흐려진다
    expect(screen.getByText('시작')).toHaveClass('peer-disabled:opacity-40')
  })
})
