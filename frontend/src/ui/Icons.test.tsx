import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CheckIcon, CloseIcon, SettingsIcon, SettingsSolidIcon } from './Icons'

describe('Icons', () => {
  it('선 굵기는 1.75 하나이고 체크만 2.5다', () => {
    const { container } = render(
      <>
        <CloseIcon />
        <SettingsIcon />
        <CheckIcon />
      </>,
    )
    const [close, settings, check] = Array.from(container.querySelectorAll('svg'))

    expect(close).toHaveAttribute('stroke-width', '1.75')
    expect(settings).toHaveAttribute('stroke-width', '1.75')
    expect(check).toHaveAttribute('stroke-width', '2.5')
  })

  it('장식이라 접근성 트리에서 숨기고 기본 크기는 20px이다', () => {
    const { container } = render(<CloseIcon />)
    const svg = container.querySelector('svg')

    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).toHaveClass('h-5', 'w-5')
  })

  it('채운 변형은 선 없이 면으로 그린다', () => {
    const { container } = render(<SettingsSolidIcon />)
    const svg = container.querySelector('svg')

    expect(svg).toHaveAttribute('fill', 'currentColor')
    expect(svg).toHaveAttribute('stroke', 'none')
  })
})
