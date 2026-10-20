import { afterEach, describe, expect, it, vi } from 'vitest'
import { useRef, useState } from 'react'
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OverlayInertRoot } from './OverlayInertRoot'
import { useOverlayLayer, useOverlayOpen } from './overlayStack'

function Layer({ active, onEscape, label }: { active: boolean; onEscape?: () => void; label: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useOverlayLayer(active, { onEscape, elementRef: ref })
  return (
    <div ref={ref} data-testid={label}>
      <button type="button">{label} 버튼</button>
    </div>
  )
}

afterEach(() => {
  document.body.style.overflow = ''
})

describe('overlayStack', () => {
  it('Escape는 맨 위 레이어만 닫는다', async () => {
    const outer = vi.fn()
    const inner = vi.fn()
    render(
      <>
        <Layer active label="outer" onEscape={outer} />
        <Layer active label="inner" onEscape={inner} />
      </>,
    )

    await userEvent.keyboard('{Escape}')

    expect(inner).toHaveBeenCalledTimes(1)
    expect(outer).not.toHaveBeenCalled()
  })

  it('한글 조합 중 Escape는 레이어를 닫지 않는다(Safari의 keyCode 229 포함)', () => {
    const onEscape = vi.fn()
    render(<Layer active label="sheet" onEscape={onEscape} />)

    fireEvent.keyDown(document, { key: 'Escape', isComposing: true })
    fireEvent.keyDown(document, { key: 'Escape', keyCode: 229 })
    expect(onEscape).not.toHaveBeenCalled()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onEscape).toHaveBeenCalledTimes(1)
  })

  it('위 레이어가 닫히면 다음 Escape는 아래 레이어가 받는다', async () => {
    const outer = vi.fn()
    const { rerender } = render(
      <>
        <Layer active label="outer" onEscape={outer} />
        <Layer active label="inner" />
      </>,
    )
    rerender(
      <>
        <Layer active label="outer" onEscape={outer} />
        <Layer active={false} label="inner" />
      </>,
    )

    await userEvent.keyboard('{Escape}')

    expect(outer).toHaveBeenCalledTimes(1)
  })

  it('스크롤 잠금은 마지막 레이어가 닫힐 때 풀린다', () => {
    document.body.style.overflow = 'auto'
    const { rerender } = render(
      <>
        <Layer active label="outer" />
        <Layer active label="inner" />
      </>,
    )
    expect(document.body.style.overflow).toBe('hidden')

    rerender(
      <>
        <Layer active label="outer" />
        <Layer active={false} label="inner" />
      </>,
    )
    expect(document.body.style.overflow).toBe('hidden')

    rerender(
      <>
        <Layer active={false} label="outer" />
        <Layer active={false} label="inner" />
      </>,
    )
    // 열기 전 값으로 되돌린다
    expect(document.body.style.overflow).toBe('auto')
  })

  it('레이어가 열려 있는 동안 앱 화면은 inert이고, 닫히면 풀린다', () => {
    function Harness() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <OverlayInertRoot>
            <button type="button" onClick={() => setOpen(true)}>
              열기
            </button>
          </OverlayInertRoot>
          <Layer active={open} label="sheet" onEscape={() => setOpen(false)} />
        </>
      )
    }
    render(<Harness />)
    const appRoot = screen.getByRole('button', { name: '열기' }).parentElement as HTMLElement
    expect(appRoot).not.toHaveAttribute('inert')

    act(() => screen.getByRole('button', { name: '열기' }).click())
    expect(appRoot).toHaveAttribute('inert')

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(appRoot).not.toHaveAttribute('inert')
  })

  it('겹친 레이어에서는 아래 레이어도 inert가 되고, 위가 닫히면 풀린다', () => {
    const { rerender } = render(
      <>
        <Layer active label="outer" />
        <Layer active label="inner" />
      </>,
    )
    expect(screen.getByTestId('outer')).toHaveAttribute('inert')
    expect(screen.getByTestId('inner')).not.toHaveAttribute('inert')

    rerender(
      <>
        <Layer active label="outer" />
        <Layer active={false} label="inner" />
      </>,
    )
    expect(screen.getByTestId('outer')).not.toHaveAttribute('inert')
  })

  it('닫힐 때 포커스가 레이어 안에 있었으면 커밋이 끝난 뒤 연 자리로 돌려준다(inert를 먼저 푼 뒤)', async () => {
    function Harness() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <OverlayInertRoot>
            <button type="button" onClick={() => setOpen(true)}>
              열기
            </button>
          </OverlayInertRoot>
          {open && <FocusingLayer onClose={() => setOpen(false)} />}
        </>
      )
    }
    function FocusingLayer({ onClose }: { onClose: () => void }) {
      const ref = useRef<HTMLDivElement>(null)
      useOverlayLayer(true, { onEscape: onClose, elementRef: ref })
      return (
        <div ref={ref}>
          <button type="button">
            안쪽
          </button>
        </div>
      )
    }
    render(<Harness />)
    const opener = screen.getByRole('button', { name: '열기' })
    opener.focus()
    act(() => opener.click())
    screen.getByRole('button', { name: '안쪽' }).focus()

    // 포커스 복귀는 ReactDOM이 커밋 직후 포커스를 되돌린 다음(마이크로태스크)에 한다
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })

    expect(document.activeElement).toBe(opener)
  })

  it('useOverlayOpen은 열린 레이어가 있는지 알려 준다', () => {
    const { result } = renderHook(() => useOverlayOpen())
    expect(result.current).toBe(false)

    const { rerender } = render(<Layer active label="sheet" />)
    expect(result.current).toBe(true)

    rerender(<Layer active={false} label="sheet" />)
    expect(result.current).toBe(false)
  })
})
