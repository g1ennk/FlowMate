import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Toast } from 'react-hot-toast'
import { UndoToast } from './UndoToast'

const fakeToast = { id: 'undo-1', visible: true } as Toast

describe('UndoToast', () => {
  it('대상 이름이 든 문구와 되돌리기 버튼을 보여 준다', async () => {
    const onUndo = vi.fn()
    render(<UndoToast t={fakeToast} message="'은행 들르기'를 삭제했어요" onUndo={onUndo} />)

    expect(screen.getByText("'은행 들르기'를 삭제했어요")).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '되돌리기' }))
    expect(onUndo).toHaveBeenCalledTimes(1)
  })

  it('되돌리기는 toast-action 색이고, 보이는 크기는 그대로 두고 터치 영역만 44로 넓힌다', () => {
    render(<UndoToast t={fakeToast} message="삭제했어요" onUndo={() => {}} />)
    const button = screen.getByRole('button', { name: '되돌리기' })

    expect(button).toHaveClass('text-toast-action', 'relative', 'after:absolute', 'after:-inset-y-3')
  })

  describe('포커스(키보드로 삭제한 뒤)', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it('takeFocus면 포커스가 사라진 경우(body) 되돌리기로 옮긴다', async () => {
      vi.useFakeTimers()
      render(<UndoToast t={fakeToast} message="삭제했어요" onUndo={() => {}} takeFocus />)
      await act(async () => { await vi.advanceTimersByTimeAsync(0) })

      expect(screen.getByRole('button', { name: '되돌리기' })).toHaveFocus()
    })

    it('포커스가 닫히는 시트(inert) 안에 남아 있어도 되돌리기로 옮긴다', async () => {
      vi.useFakeTimers()
      const { container } = render(
        <div inert><button type="button">삭제</button></div>,
      )
      ;(container.querySelector('button') as HTMLButtonElement).focus()
      render(<UndoToast t={fakeToast} message="삭제했어요" onUndo={() => {}} takeFocus />)
      await act(async () => { await vi.advanceTimersByTimeAsync(0) })

      expect(screen.getByRole('button', { name: '되돌리기' })).toHaveFocus()
    })

    it('사용자가 다른 곳에 포커스를 두고 있으면 빼앗지 않는다', async () => {
      vi.useFakeTimers()
      render(<input aria-label="입력" />)
      screen.getByRole('textbox').focus()
      render(<UndoToast t={fakeToast} message="삭제했어요" onUndo={() => {}} takeFocus />)
      await act(async () => { await vi.advanceTimersByTimeAsync(0) })

      expect(screen.getByRole('textbox')).toHaveFocus()
    })

    it('포커스가 있는 채로 토스트가 사라지면 returnFocus로 돌려준다(되돌렸는지 함께 알린다)', async () => {
      vi.useFakeTimers()
      const returnFocus = vi.fn()
      const { rerender } = render(
        <UndoToast t={fakeToast} message="삭제했어요" onUndo={() => {}} takeFocus returnFocus={returnFocus} />,
      )
      await act(async () => { await vi.advanceTimersByTimeAsync(0) })
      rerender(
        <UndoToast t={{ ...fakeToast, visible: false }} message="삭제했어요" onUndo={() => {}} takeFocus returnFocus={returnFocus} />,
      )
      await act(async () => { await vi.advanceTimersByTimeAsync(0) })

      expect(returnFocus).toHaveBeenCalledWith(false)
    })

    it('되돌리기를 누르면 returnFocus(true)를 부른다', async () => {
      vi.useFakeTimers()
      const returnFocus = vi.fn()
      const { rerender } = render(
        <UndoToast t={fakeToast} message="삭제했어요" onUndo={() => {}} takeFocus returnFocus={returnFocus} />,
      )
      await act(async () => { await vi.advanceTimersByTimeAsync(0) })
      act(() => screen.getByRole('button', { name: '되돌리기' }).click())
      rerender(
        <UndoToast t={{ ...fakeToast, visible: false }} message="삭제했어요" onUndo={() => {}} takeFocus returnFocus={returnFocus} />,
      )
      await act(async () => { await vi.advanceTimersByTimeAsync(0) })

      expect(returnFocus).toHaveBeenCalledWith(true)
    })
  })
})
