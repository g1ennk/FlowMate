import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { act } from 'react'
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

  it('끝까지 밀어도 버튼 폭(고정)까지만 밀리고 지우지 않는다(full swipe 없음)', () => {
    const { onDelete, row } = setup()
    fireEvent.touchStart(row, { touches: [{ clientX: 300, clientY: 100 }] })
    fireEvent.touchMove(row, { touches: [{ clientX: 200, clientY: 100 }] })
    fireEvent.touchMove(row, { touches: [{ clientX: 20, clientY: 100 }] })
    expect(row).toHaveAttribute('data-offset', String(-REVEAL_WIDTH))
    fireEvent.touchEnd(row, { touches: [] })
    expect(row).toHaveAttribute('data-offset', String(-REVEAL_WIDTH))
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('데스크톱: 마우스로 왼쪽으로 끌어도 삭제가 드러난다', () => {
    const { row } = setup()
    // jsdom에는 PointerEvent가 없어 MouseEvent에 pointerType을 붙인다
    const down = new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 300, clientY: 100 })
    Object.defineProperty(down, 'pointerType', { value: 'mouse' })
    fireEvent(row, down)
    act(() => {
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 270, clientY: 100 }))
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 240, clientY: 100 }))
      window.dispatchEvent(new MouseEvent('pointerup'))
    })
    expect(row).toHaveAttribute('data-offset', String(-REVEAL_WIDTH))
  })

  it('데스크톱: 트랙패드 두 손가락 가로 밀기로도 드러나고, 세로 스크롤은 그대로 둔다', () => {
    vi.useFakeTimers()
    try {
      const { row } = setup()
      fireEvent.wheel(row, { deltaX: 0, deltaY: 40 })
      expect(row).toHaveAttribute('data-offset', '0')
      fireEvent.wheel(row, { deltaX: 30, deltaY: 2 })
      fireEvent.wheel(row, { deltaX: 30, deltaY: 0 })
      act(() => { vi.advanceTimersByTime(200) })
      expect(row).toHaveAttribute('data-offset', String(-REVEAL_WIDTH))
    } finally {
      vi.useRealTimers()
    }
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
