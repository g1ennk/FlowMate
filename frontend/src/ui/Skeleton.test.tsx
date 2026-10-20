import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { ReviewSkeleton, TodosSkeleton } from './Skeleton'

function bones(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>('[data-bone]'))
}

describe('Skeleton', () => {
  it('뼈대 색은 border-default로 칠해 라이트에서도 보이고, 움직임 줄이기에서는 깜빡이지 않는다', () => {
    const { container } = render(<TodosSkeleton />)

    expect(bones(container).length).toBeGreaterThan(0)
    for (const bone of bones(container)) {
      expect(bone).toHaveClass('bg-border-default', 'motion-safe:animate-pulse')
      expect(bone).not.toHaveClass('bg-surface-sunken')
    }
  })

  it('할 일 스켈레톤은 실제 화면처럼 구간 행 4개(펼침 화살표, 구간 이름, 메타, 추가 버튼)다', () => {
    const { container } = render(<TodosSkeleton />)
    const rows = container.querySelectorAll('[data-skeleton-row]')

    expect(rows).toHaveLength(4)
    rows.forEach((row) => expect(row.querySelectorAll('[data-bone]')).toHaveLength(4))
  })

  it('회고 스켈레톤은 실제 순서대로 집중 기록 카드, 할 일 카드, 회고 입력창이다(기간 이동은 실제로 그린다)', () => {
    const { container } = render(<ReviewSkeleton />)
    const parts = [...container.querySelectorAll('[data-skeleton-input], [data-skeleton-card]')]

    expect(container.querySelectorAll('[data-skeleton-nav]')).toHaveLength(0)
    expect(parts.map((e) => (e.hasAttribute('data-skeleton-input') ? 'input' : 'card'))).toEqual(['card', 'card', 'input'])
  })

  it('보조 기술에는 읽히지 않는다', () => {
    const { container } = render(<ReviewSkeleton />)
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true')
  })
})
