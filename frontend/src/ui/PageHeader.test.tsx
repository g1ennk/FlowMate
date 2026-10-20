import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PageHeader } from './PageHeader'

describe('PageHeader', () => {
  it('page 제목 한 줄을 고정 높이로 그린다', () => {
    render(<PageHeader title="회고" />)

    expect(screen.getByRole('heading', { level: 1, name: '회고' })).toHaveClass('text-xl', 'font-bold')
    expect(screen.getByRole('banner')).toHaveClass('h-10')
  })

  it('trailing을 제목 줄 오른쪽에 둔다', () => {
    render(<PageHeader title="설정" trailing={<button type="button">편집</button>} />)

    expect(screen.getByRole('banner')).toContainElement(screen.getByRole('button', { name: '편집' }))
  })

  it('trailing은 아래 줄이 있어도 제목 줄(24, 가운데 12)에 가운데를 맞춘다(Task 21)', () => {
    render(<PageHeader title="10월 18일 일요일" meta={<span>집중 25분</span>} trailing={<button type="button">선택</button>} />)
    const box = screen.getByRole('button', { name: '선택' }).parentElement

    // 높이 40 칸을 위로 8 올려 칸 가운데(20 - 8)가 제목 줄 가운데(12)에 온다
    expect(box).toHaveClass('-mt-2', 'h-10', 'items-center', 'self-start')
    expect(screen.getByRole('banner')).toHaveClass('items-start')
  })

  it('subtitle은 제목 아래 작은 줄의 보조 글자이고 제목 이름에는 들어가지 않는다', () => {
    render(<PageHeader title="10월 18일 일요일" subtitle="어제" />)

    const title = screen.getByRole('heading', { level: 1, name: '10월 18일 일요일' })
    const relative = screen.getByText('어제')
    expect(relative.closest('p')).toHaveClass('text-text-secondary', 'text-xs')
    expect(title.compareDocumentPosition(relative) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('subtitle과 meta는 아래 줄에 " · "로 잇고, 아래 줄이 있어도 머리 높이는 40이다', () => {
    render(<PageHeader title="10월 18일 일요일" subtitle="어제" meta={<span>집중 25분</span>} />)

    expect(screen.getByText('어제').closest('p')).toHaveTextContent('어제 · 집중 25분')
    expect(screen.getByRole('banner')).toHaveClass('h-10')
    expect(screen.getByRole('heading', { level: 1 })).toHaveClass('leading-6')
  })

  it('아래 줄이 없어도 제목은 같은 자리(머리 맨 위, 줄 높이 24)에 둬 탭마다 제목 위치가 같다', () => {
    render(<PageHeader title="회고" />)

    const title = screen.getByRole('heading', { level: 1, name: '회고' })
    expect(title).toHaveClass('leading-6')
    expect(title.parentElement).toHaveClass('self-stretch', 'justify-start')
  })
})
