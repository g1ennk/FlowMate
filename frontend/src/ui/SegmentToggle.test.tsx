import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { SegmentToggle } from './SegmentToggle'

const options = [
  { label: '시스템', value: 'system' },
  { label: '라이트', value: 'light' },
  { label: '다크', value: 'dark' },
] as const

function Controlled({ onChange = () => {} }: { onChange?: (value: string) => void }) {
  const [value, setValue] = useState<'system' | 'light' | 'dark'>('system')
  return (
    <SegmentToggle
      ariaLabel="화면 테마"
      options={options}
      value={value}
      onChange={(next) => {
        setValue(next)
        onChange(next)
      }}
    />
  )
}

describe('SegmentToggle', () => {
  it('이름이 있는 radiogroup이고 고른 칸만 checked다', () => {
    render(<Controlled />)

    expect(screen.getByRole('radiogroup', { name: '화면 테마' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '시스템' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: '다크' })).toHaveAttribute('aria-checked', 'false')
  })

  it('누르면 그 값을 고른다', async () => {
    const onChange = vi.fn()
    render(<Controlled onChange={onChange} />)

    await userEvent.click(screen.getByRole('radio', { name: '다크' }))

    expect(onChange).toHaveBeenCalledWith('dark')
    expect(screen.getByRole('radio', { name: '다크', checked: true })).toBeInTheDocument()
  })

  it('고른 칸만 Tab으로 들어오고 방향키로 옮기면 바로 고른다', async () => {
    const user = userEvent.setup()
    render(<Controlled />)

    await user.tab()
    expect(screen.getByRole('radio', { name: '시스템' })).toHaveFocus()
    expect(screen.getByRole('radio', { name: '라이트' })).toHaveAttribute('tabindex', '-1')

    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('radio', { name: '라이트' })).toHaveFocus()
    expect(screen.getByRole('radio', { name: '라이트' })).toHaveAttribute('aria-checked', 'true')

    await user.keyboard('{ArrowLeft}{ArrowLeft}')
    expect(screen.getByRole('radio', { name: '다크' })).toHaveFocus()
    expect(screen.getByRole('radio', { name: '다크' })).toHaveAttribute('aria-checked', 'true')
  })

  it('칸 글자만으로 뜻이 모자라면 option.ariaLabel을 이름으로 쓴다', () => {
    render(
      <SegmentToggle
        ariaLabel="달력 보기"
        options={[{ label: '월', value: 'month', ariaLabel: '월 보기' }]}
        value="month"
        onChange={() => {}}
      />,
    )

    expect(screen.getByRole('radio', { name: '월 보기' })).toHaveTextContent('월')
  })

  it('높이 36, 12px 이상 글자를 쓰고 활성 칸은 accent로 채우지 않는다', () => {
    render(<Controlled />)

    expect(screen.getByRole('radiogroup')).toHaveClass('h-9', 'rounded-control', 'bg-surface-sunken')
    const active = screen.getByRole('radio', { name: '시스템' })
    expect(active).toHaveClass('text-sm', 'bg-surface-card', 'text-text-primary', 'font-semibold')
    expect(active.className).not.toMatch(/text-\[11px\]|bg-accent/)
  })

  it('칸은 보이는 높이 28에 터치 영역을 위아래 8px씩 넓혀 44로 맞춘다', () => {
    render(<Controlled />)

    for (const radio of screen.getAllByRole('radio')) {
      expect(radio).toHaveClass('relative', 'after:absolute', 'after:inset-x-0', 'after:-inset-y-2')
    }
  })

  it('칸은 가로도 44 이상이다(달력 월/주처럼 한 글자 칸)', () => {
    render(<Controlled />)

    for (const radio of screen.getAllByRole('radio')) {
      expect(radio).toHaveClass('min-w-11')
    }
  })

  it('timer tone은 timer 토큰으로 칸을 칠한다', () => {
    render(
      <SegmentToggle
        tone="timer"
        ariaLabel="스톱워치 표시 기준"
        options={[{ label: '현재 세션', value: 'current' }, { label: '전체 누적', value: 'total' }]}
        value="current"
        onChange={() => {}}
      />,
    )

    expect(screen.getByRole('radiogroup')).toHaveClass('bg-timer-btn')
    expect(screen.getByRole('radio', { name: '현재 세션' })).toHaveClass('bg-timer-btn-hover', 'text-timer-focus-text')
  })

  it('고른 칸은 계획 달력 월/주처럼 카드 면으로 채우고 그림자를 주며 테두리는 없다', () => {
    render(<Controlled />)

    const active = screen.getByRole('radio', { name: '시스템' })
    expect(active).toHaveClass('bg-surface-card', 'font-semibold', 'shadow-sm')
    expect(active.className).not.toMatch(/ring-/)
    expect(screen.getByRole('radio', { name: '다크' }).className).not.toMatch(/ring-|shadow/)
  })

  it('timer tone의 고른 칸 경계도 timer 토큰이다', () => {
    render(
      <SegmentToggle
        tone="timer"
        ariaLabel="스톱워치 표시 기준"
        options={[{ label: '현재 세션', value: 'current' }, { label: '전체 누적', value: 'total' }]}
        value="current"
        onChange={() => {}}
      />,
    )

    expect(screen.getByRole('radio', { name: '현재 세션' })).toHaveClass('ring-1', 'ring-timer-modal-secondary')
    expect(screen.getByRole('radio', { name: '전체 누적' }).className).not.toMatch(/ring-/)
  })

  it('기본 트랙은 회색 면이고, track="none"이면 트랙 면 없이 고른 칸의 테두리 pill만 남는다', () => {
    const { unmount } = render(<Controlled />)
    expect(screen.getByRole('radiogroup', { name: '화면 테마' })).toHaveClass('bg-surface-sunken')
    unmount()

    render(<SegmentToggle ariaLabel="회고 기간" track="none" options={options} value="system" onChange={() => {}} />)
    const group = screen.getByRole('radiogroup', { name: '회고 기간' })
    expect(group).not.toHaveClass('bg-surface-sunken')
    expect(screen.getByRole('radio', { name: '시스템' })).toHaveClass('bg-surface-card', 'ring-1', 'ring-inset', 'ring-text-tertiary')
  })

  it('chip 모양은 예전 타이머 칩처럼 둥근 알약 트랙에 고른 칸을 밝게 채운 작은 글자다', () => {
    render(<SegmentToggle ariaLabel="스톱워치 표시 기준" tone="timer" shape="chip" options={options} value="light" onChange={() => {}} />)
    const group = screen.getByRole('radiogroup', { name: '스톱워치 표시 기준' })
    expect(group).toHaveClass('rounded-full', 'bg-timer-btn', 'p-0.5')
    const active = screen.getByRole('radio', { name: '라이트' })
    expect(active).toHaveClass('rounded-full', 'bg-timer-focus-text', 'text-timer-focus-bg', 'text-[11px]')
    expect(active).not.toHaveClass('ring-1')
    expect(screen.getByRole('radio', { name: '시스템' })).toHaveClass('text-timer-modal-secondary')
  })
})
