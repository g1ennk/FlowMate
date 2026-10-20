import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { BatchActionBar } from './BatchActionBar'

const noop = () => {}

describe('BatchActionBar', () => {
  it('떠 있는 동안 토스트가 바를 가리지 않도록 바 높이와 간격을 알리고, 사라지면 지운다', () => {
    const root = document.documentElement
    const { unmount } = render(<BatchActionBar selectedCount={2} onComplete={noop} onDelete={noop} />)
    // jsdom은 높이가 0이라 바 아래 간격(12px)만 남는다
    expect(root.style.getPropertyValue('--batch-bar-offset')).toBe('12px')

    unmount()
    expect(root.style.getPropertyValue('--batch-bar-offset')).toBe('')
  })

  it('아무것도 고르지 않아도 보이고, 무엇을 하는 바인지 알리며 버튼은 막아 둔다', () => {
    render(<BatchActionBar selectedCount={0} onComplete={noop} onDelete={noop} />)

    expect(screen.getByText('선택한 할 일이 없어요')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '완료 처리' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '삭제' })).toBeDisabled()
  })

  it('고른 개수를 알리고, 삭제는 빨간 글자 버튼, 완료 처리는 주 버튼이다', () => {
    const onComplete = vi.fn()
    const onDelete = vi.fn()
    render(<BatchActionBar selectedCount={2} onComplete={onComplete} onDelete={onDelete} />)

    expect(screen.getByText('2개 선택')).toBeInTheDocument()
    const remove = screen.getByRole('button', { name: '삭제' })
    expect(remove).toHaveClass('text-state-error-text')
    expect(remove.className).not.toMatch(/bg-state-error-strong/)
    expect(screen.getByRole('button', { name: '완료 처리' })).toHaveClass('bg-accent-fill')

    fireEvent.click(remove)
    fireEvent.click(screen.getByRole('button', { name: '완료 처리' }))
    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('본문과 같은 폭과 여백으로 띄운다', () => {
    render(<BatchActionBar selectedCount={1} onComplete={noop} onDelete={noop} />)

    const panel = screen.getByText('1개 선택').parentElement!
    expect(panel).toHaveClass('shadow-float')
    expect(panel.parentElement).toHaveClass('max-w-lg', 'px-page-x')
  })
})
