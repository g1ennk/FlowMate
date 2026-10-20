import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { REVEAL_WIDTH, useSwipeToDelete } from './useSwipeToDelete'

function Row({ onDelete, onTap, enabled = true }: { onDelete: () => void; onTap?: () => void; enabled?: boolean }) {
  const { rowRef, offset, handlers, onClickCapture, handleDelete } = useSwipeToDelete({ enabled, onDelete })
  return (
    <div>
      <div ref={rowRef} data-testid="row" data-offset={offset} {...handlers}>
        {offset !== 0 && <button type="button" onClick={handleDelete}>삭제</button>}
        <div onClickCapture={onClickCapture}>
          <button type="button" onClick={onTap}>제목</button>
        </div>
      </div>
      <button type="button">밖</button>
    </div>
  )
}

function swipe(el: HTMLElement, dx: number, dy = 0) {
  fireEvent.touchStart(el, { touches: [{ clientX: 300, clientY: 100 }] })
  fireEvent.touchMove(el, { touches: [{ clientX: 300 + dx / 2, clientY: 100 + dy / 2 }] })
  fireEvent.touchMove(el, { touches: [{ clientX: 300 + dx, clientY: 100 + dy }] })
  fireEvent.touchEnd(el, { touches: [] })
}

function setup(props: Partial<Parameters<typeof Row>[0]> = {}) {
  const onDelete = vi.fn()
  render(<Row onDelete={onDelete} {...props} />)
  const row = screen.getByTestId('row')
  Object.defineProperty(row, 'offsetWidth', { value: 320, configurable: true })
  return { onDelete, row }
}

describe('useSwipeToDelete', () => {
  it('조금 밀면 삭제 버튼이 드러나 머물고, 누르면 지운다', () => {
    const { onDelete, row } = setup()
    swipe(row, -60)
    expect(row).toHaveAttribute('data-offset', String(-REVEAL_WIDTH))
    fireEvent.click(screen.getByRole('button', { name: '삭제' }))
    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(row).toHaveAttribute('data-offset', '0')
  })

  it('행 폭의 절반을 넘겨 밀면 바로 지운다', () => {
    const { onDelete, row } = setup()
    swipe(row, -200)
    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  it('살짝만 밀면 제자리로 돌아간다', () => {
    const { onDelete, row } = setup()
    swipe(row, -20)
    expect(row).toHaveAttribute('data-offset', '0')
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('세로로 먼저 움직이면(스크롤) 밀리지 않는다', () => {
    const { row } = setup()
    swipe(row, -60, 80)
    expect(row).toHaveAttribute('data-offset', '0')
  })

  it('열린 행의 내용을 누르면 그 동작 대신 닫기만 하고, 밖을 누르면 닫힌다', () => {
    const onTap = vi.fn()
    const { row } = setup({ onTap })
    swipe(row, -60)
    // 민 직후의 click은 버린다
    fireEvent.click(screen.getByRole('button', { name: '제목' }))
    fireEvent.touchStart(row, { touches: [{ clientX: 10, clientY: 10 }] })
    fireEvent.touchEnd(row, { touches: [] })
    fireEvent.click(screen.getByRole('button', { name: '제목' }))
    expect(onTap).not.toHaveBeenCalled()
    expect(row).toHaveAttribute('data-offset', '0')

    swipe(row, -60)
    fireEvent.touchStart(screen.getByRole('button', { name: '밖' }), { touches: [{ clientX: 10, clientY: 10 }] })
    expect(row).toHaveAttribute('data-offset', '0')
  })

  it('꺼져 있으면(편집, 선택 모드) 밀리지 않는다', () => {
    const { row } = setup({ enabled: false })
    swipe(row, -60)
    expect(row).toHaveAttribute('data-offset', '0')
  })
})
