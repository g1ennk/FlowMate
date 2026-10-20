import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { KeyboardShortcutsHelp } from './KeyboardShortcutsHelp'
import { OverlayInertRoot } from './OverlayInertRoot'

afterEach(() => {
  document.body.style.overflow = ''
})

describe('KeyboardShortcutsHelp', () => {
  it('열린 동안 오버레이로 등록되어 뒤 화면이 inert가 되고, Escape로 닫는다', async () => {
    const onClose = vi.fn()
    render(
      <>
        <OverlayInertRoot>
          <button type="button">앱 버튼</button>
        </OverlayInertRoot>
        <KeyboardShortcutsHelp isOpen onClose={onClose} />
      </>,
    )

    expect(screen.getByRole('dialog', { name: '키보드 단축키' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '앱 버튼', hidden: true }).closest('[inert]')).not.toBeNull()
    expect(document.body.style.overflow).toBe('hidden')

    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('열리면 대화상자 안으로 포커스를 옮기고, 닫으면 연 자리로 돌려준다', async () => {
    function Harness() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <OverlayInertRoot>
            <button type="button" onClick={() => setOpen(true)}>단축키 보기</button>
          </OverlayInertRoot>
          <KeyboardShortcutsHelp isOpen={open} onClose={() => setOpen(false)} />
        </>
      )
    }
    render(<Harness />)
    const opener = screen.getByRole('button', { name: '단축키 보기' })

    await userEvent.click(opener)
    expect(screen.getByRole('dialog', { name: '키보드 단축키' })).toContainElement(document.activeElement as HTMLElement)

    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await vi.waitFor(() => expect(opener).toHaveFocus())
  })
})
