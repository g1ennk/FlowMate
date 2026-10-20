import { StrictMode, useState } from 'react'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BottomSheet, BottomSheetItem } from './BottomSheet'
import { ConfirmSheet } from './ConfirmSheet'

afterEach(() => {
  vi.useRealTimers()
  document.body.style.overflow = ''
})

describe('BottomSheet', () => {
  it('닫혀 있으면 아무것도 그리지 않는다', () => {
    render(<BottomSheet isOpen={false} onClose={() => {}} title="세션 상세">내용</BottomSheet>)

    expect(screen.queryByText('내용')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('열리면 제목을 이름으로 가진 모달 dialog다', () => {
    render(<BottomSheet isOpen onClose={() => {}} title="세션 상세">내용</BottomSheet>)
    const dialog = screen.getByRole('dialog', { name: '세션 상세' })

    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveClass('bg-surface-card', 'rounded-t-sheet', 'shadow-float')
    expect(screen.getByRole('heading', { name: '세션 상세' })).toHaveClass('text-base', 'font-semibold', 'text-center')
  })

  it('열리면 시트 안으로 포커스를 옮긴다', () => {
    render(<BottomSheet isOpen onClose={() => {}} title="세션 상세">내용</BottomSheet>)

    expect(screen.getByRole('dialog')).toHaveFocus()
  })

  it('제목 줄 오른쪽에는 동작 버튼만 두고 보이는 닫기 X는 없다', () => {
    render(
      <BottomSheet isOpen onClose={() => {}} title="사운드" headerAction={<button type="button">초기화</button>}>
        내용
      </BottomSheet>,
    )
    const titleRow = screen.getByRole('heading', { name: '사운드' }).parentElement

    expect(titleRow).toContainElement(screen.getByRole('button', { name: '초기화' }))
    expect(titleRow).not.toContainElement(screen.getByRole('button', { name: '닫기' }))
    expect(titleRow?.className).not.toMatch(/border-b/)
  })

  it('닫기는 시트 끝의 스크린리더용 버튼이고, 키보드 포커스를 받으면 보인다', async () => {
    const onClose = vi.fn()
    render(
      <BottomSheet isOpen onClose={onClose} title="세션 상세">
        <button type="button">내용 버튼</button>
      </BottomSheet>,
    )
    const close = screen.getByRole('button', { name: '닫기' })
    const buttons = within(screen.getByRole('dialog')).getAllByRole('button')

    // 시트 안 마지막 버튼이다(Tab 순서의 끝)
    expect(buttons[buttons.length - 1]).toBe(close)
    expect(close).toHaveClass('sr-only', 'focus-visible:not-sr-only')

    await userEvent.click(close)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('제목이 없는 시트에도 스크린리더용 닫기를 둔다', () => {
    render(<BottomSheet isOpen onClose={() => {}} ariaLabel="메모">내용</BottomSheet>)

    expect(screen.getByRole('dialog', { name: '메모' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '닫기' })).toHaveClass('sr-only')
  })

  it('srCloseButton={false}면 닫기 버튼을 두지 않는다(취소 버튼이 있는 확인 시트)', () => {
    render(<BottomSheet isOpen onClose={() => {}} title="확인" srCloseButton={false}>내용</BottomSheet>)

    expect(screen.queryByRole('button', { name: '닫기' })).not.toBeInTheDocument()
  })

  it('Escape로 닫는다', async () => {
    const onClose = vi.fn()
    render(<BottomSheet isOpen onClose={onClose} title="세션 상세">내용</BottomSheet>)

    await userEvent.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalled()
  })

  it('StrictMode에서 처음부터 열린 채 마운트돼도 포커스가 시트로 가고, 닫으면 연 자리로 돌아간다', async () => {
    // 개발 모드 StrictMode는 layout effect를 마운트 → 정리 → 다시 마운트한다.
    // 정리 때 예약된 포커스 복귀가 다시 올린 레이어를 덮거나, 다시 올린 레이어가 연 자리를 잃으면 안 된다
    function Harness() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>열기</button>
          {open && (
            <BottomSheet isOpen onClose={() => setOpen(false)} title="사운드">
              내용
            </BottomSheet>
          )}
        </>
      )
    }
    const user = userEvent.setup()
    render(
      <StrictMode>
        <Harness />
      </StrictMode>,
    )

    await user.click(screen.getByRole('button', { name: '열기' }))
    await act(async () => {})
    const dialog = screen.getByRole('dialog', { name: '사운드' })
    expect(dialog.contains(document.activeElement)).toBe(true)

    await user.click(screen.getByRole('button', { name: '닫기' }))
    await act(async () => {})
    expect(screen.getByRole('button', { name: '열기' })).toHaveFocus()
  })

  it('timer tone 배경 막은 테마와 무관한 timer-overlay를 쓴다', () => {
    render(<BottomSheet isOpen onClose={() => {}} title="사운드" tone="timer">내용</BottomSheet>)
    const backdrop = screen.getByRole('dialog', { name: '사운드' }).closest('[style*="z-index"]')?.firstElementChild

    expect(backdrop).toHaveClass('bg-timer-overlay')
    expect(backdrop).not.toHaveClass('bg-surface-overlay')
  })

  it('timer tone은 timer-modal 면과 글자를 쓴다', () => {
    render(<BottomSheet isOpen onClose={() => {}} title="사운드" tone="timer">내용</BottomSheet>)

    expect(screen.getByRole('dialog', { name: '사운드' })).toHaveClass('bg-timer-modal-bg')
    // 그림자도 테마를 따르지 않는 timer 값이다(라이트와 다크에서 같은 모습)
    expect(screen.getByRole('dialog', { name: '사운드' })).toHaveClass('shadow-timer-float')
    expect(screen.getByRole('dialog', { name: '사운드' })).not.toHaveClass('shadow-float')
    expect(screen.getByRole('heading', { name: '사운드' })).toHaveClass('text-timer-modal-text')
    expect(screen.getByRole('button', { name: '닫기' })).toHaveClass('focus-visible:text-timer-modal-secondary')
  })

  it('닫히면 내려가는 동안 접근성 트리에서 빠지고, 끝나면 DOM에서도 빠진다', () => {
    vi.useFakeTimers()
    const { rerender } = render(<BottomSheet isOpen onClose={() => {}} title="세션 상세">내용</BottomSheet>)

    rerender(<BottomSheet isOpen={false} onClose={() => {}} title="세션 상세">내용</BottomSheet>)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const closing = screen.getByText('내용').closest('[aria-hidden="true"]')
    expect(closing).toHaveAttribute('inert')

    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(screen.queryByText('내용')).not.toBeInTheDocument()
  })

  it('닫는 동안 다시 열면 그대로 열린 상태로 남는다', () => {
    vi.useFakeTimers()
    const { rerender } = render(<BottomSheet isOpen onClose={() => {}} title="세션 상세">내용</BottomSheet>)

    rerender(<BottomSheet isOpen={false} onClose={() => {}} title="세션 상세">내용</BottomSheet>)
    rerender(<BottomSheet isOpen onClose={() => {}} title="세션 상세">내용</BottomSheet>)
    act(() => {
      vi.advanceTimersByTime(400)
    })

    expect(screen.getByRole('dialog', { name: '세션 상세' })).toBeInTheDocument()
  })
  it('겹친 시트에서 Escape는 맨 위 시트만 닫는다', async () => {
    const closeMenu = vi.fn()
    const cancelConfirm = vi.fn()
    render(
      <>
        <BottomSheet isOpen onClose={closeMenu} title="메뉴">내용</BottomSheet>
        <ConfirmSheet
          isOpen
          title="삭제할까요?"
          confirmLabel="삭제"
          cancelLabel="돌아가기"
          onConfirm={() => {}}
          onCancel={cancelConfirm}
        />
      </>,
    )

    await userEvent.keyboard('{Escape}')

    expect(cancelConfirm).toHaveBeenCalledTimes(1)
    expect(closeMenu).not.toHaveBeenCalled()
  })

  it('위 시트가 닫혀도 아래 시트가 열려 있으면 스크롤 잠금을 유지한다', () => {
    // 실제 호출부처럼 핸들러는 렌더마다 바뀌지 않는다
    const noop = () => {}
    const sheets = (confirmOpen: boolean, menuOpen = true) => (
      <>
        <BottomSheet isOpen={menuOpen} onClose={noop} title="메뉴">내용</BottomSheet>
        <ConfirmSheet
          isOpen={confirmOpen}
          title="삭제할까요?"
          confirmLabel="삭제"
          cancelLabel="돌아가기"
          onConfirm={noop}
          onCancel={noop}
        />
      </>
    )
    const { rerender } = render(sheets(true))
    expect(document.body.style.overflow).toBe('hidden')

    rerender(sheets(false))
    expect(document.body.style.overflow).toBe('hidden')

    rerender(sheets(false, false))
    expect(document.body.style.overflow).toBe('')
  })

  it('위에 확인 시트가 뜨면 아래 시트는 inert가 된다', () => {
    render(
      <>
        <BottomSheet isOpen onClose={() => {}} title="메뉴">내용</BottomSheet>
        <ConfirmSheet
          isOpen
          title="삭제할까요?"
          confirmLabel="삭제"
          cancelLabel="돌아가기"
          onConfirm={() => {}}
          onCancel={() => {}}
        />
      </>,
    )

    expect(screen.getByRole('dialog', { name: '메뉴', hidden: true })).toHaveAttribute('inert')
    expect(screen.getByRole('dialog', { name: '삭제할까요?' })).not.toHaveAttribute('inert')
  })
})

// X6: 시트 안 Tab이 마지막 버튼에서 body로 빠지지 않고 처음으로 돈다(뒤 화면은 inert라 갈 곳이 없다)
describe('BottomSheet Tab 순환', () => {
  function renderWithButtons() {
    render(
      <BottomSheet isOpen onClose={() => {}} title="확인">
        <button type="button">첫째</button>
        <button type="button" disabled>막힘</button>
        <button type="button">둘째</button>
      </BottomSheet>,
    )
  }

  it('마지막(시트 끝의 닫기)에서 Tab이면 첫 버튼으로 돈다', () => {
    renderWithButtons()
    const last = screen.getByRole('button', { name: '닫기' })
    last.focus()
    fireEvent.keyDown(last, { key: 'Tab' })

    expect(screen.getByRole('button', { name: '첫째' })).toHaveFocus()
  })

  it('처음(또는 시트 자체)에서 Shift+Tab이면 마지막 버튼으로 돈다', () => {
    renderWithButtons()
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveFocus()
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
    expect(screen.getByRole('button', { name: '닫기' })).toHaveFocus()

    const first = screen.getByRole('button', { name: '첫째' })
    first.focus()
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true })
    expect(screen.getByRole('button', { name: '닫기' })).toHaveFocus()
  })

  it('가운데에서는 Tab을 가로채지 않는다', () => {
    renderWithButtons()
    const middle = screen.getByRole('button', { name: '둘째' })
    middle.focus()
    const notPrevented = fireEvent.keyDown(middle, { key: 'Tab' })

    expect(notPrevented).toBe(true)
  })
})

// X8: 움직임 줄이기에서는 열 때(globals.css 페이드)뿐 아니라 닫을 때도 미끄러지지 않고 제자리에서 사라진다
describe('BottomSheet 움직임 줄이기', () => {
  function mockReducedMotion(reduce: boolean) {
    return vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
      matches: reduce && query.includes('prefers-reduced-motion: reduce'),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  }

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('닫을 때 아래로 미끄러지지 않고 제자리에서 흐려진다', () => {
    mockReducedMotion(true)
    const { rerender } = render(<BottomSheet isOpen onClose={() => {}} title="사운드">내용</BottomSheet>)
    rerender(<BottomSheet isOpen={false} onClose={() => {}} title="사운드">내용</BottomSheet>)

    const panel = screen.getByRole('dialog', { hidden: true })
    expect(panel.style.transform).not.toContain('100%')
    expect(panel.className).not.toMatch(/transition-transform/)
    expect(panel).toHaveClass('transition-opacity', 'opacity-0')
  })

  it('움직임을 줄이지 않으면 닫을 때 아래로 내려간다', () => {
    mockReducedMotion(false)
    const { rerender } = render(<BottomSheet isOpen onClose={() => {}} title="사운드">내용</BottomSheet>)
    rerender(<BottomSheet isOpen={false} onClose={() => {}} title="사운드">내용</BottomSheet>)

    const panel = screen.getByRole('dialog', { hidden: true })
    expect(panel.style.transform).toBe('translateY(100%)')
    expect(panel).toHaveClass('transition-transform')
  })
})

describe('BottomSheet 정렬(Task 21)', () => {
  it('머리 여백은 8이라 양옆 글자 버튼(안쪽 12)의 글자가 내용 여백 20에 온다', () => {
    render(
      <BottomSheet isOpen onClose={() => {}} title="메모" headerAction={<button type="button">편집</button>}>
        내용
      </BottomSheet>,
    )
    const header = screen.getByRole('heading', { name: '메모' }).parentElement

    expect(header).toHaveClass('px-2')
    expect(header).not.toHaveClass('px-3')
  })

  it('시트 항목 글자는 내용 여백에 붙고, 아이콘은 앞 열(32) 가운데, hover 면만 양옆 8 넓힌다', () => {
    render(<BottomSheetItem icon={<svg data-testid="icon" />} label="메모" onClick={() => {}} />)
    const item = screen.getByRole('button', { name: '메모' })

    expect(item).toHaveClass('min-h-12', 'gap-list', 'before:-inset-x-2')
    expect(item.className).not.toMatch(/(^| )px-/)
    expect(screen.getByTestId('icon').parentElement).toHaveClass('w-8', 'justify-center')
  })
})
