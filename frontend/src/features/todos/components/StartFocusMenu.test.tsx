import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StartFocusMenu } from './StartFocusMenu'

// jsdom은 배치를 하지 않으므로 버튼 자리와 메뉴 크기를 정해 둔다(375×768 화면, 메뉴 192×98)
function renderMenu(anchorRect: { top: number; bottom: number; right: number }, handlers: { onChoose?: () => void; onClose?: () => void } = {}) {
  const anchor = document.createElement('button')
  anchor.dataset.testAnchor = ''
  document.body.appendChild(anchor)
  anchor.getBoundingClientRect = () => ({ ...anchorRect, left: anchorRect.right - 32, width: 32, height: 32, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(98)
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(192)
  vi.stubGlobal('innerWidth', 375)
  vi.stubGlobal('innerHeight', 768)
  render(<StartFocusMenu todoTitle="할 일 A" anchor={anchor} lastMode="pomodoro" onChoose={handlers.onChoose ?? vi.fn()} onClose={handlers.onClose ?? vi.fn()} />)
  return screen.getByRole('menu', { name: '할 일 A 타이머 고르기' })
}

describe('StartFocusMenu', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    document.querySelectorAll('[data-test-anchor]').forEach((el) => el.remove())
  })

  it('opens right below the button with its right edge on the button', () => {
    const menu = renderMenu({ top: 200, bottom: 232, right: 351 })

    expect(menu).toHaveStyle({ top: '236px', left: `${351 - 192}px`, visibility: 'visible' })
    // 최근에 쓴 쪽에 표시하고 처음 포커스를 둔다
    expect(screen.getByRole('menuitem', { name: '뽀모도로 타이머 최근' })).toHaveFocus()
  })

  it('opens above the button when there is no room below, and stays inside the screen', () => {
    const menu = renderMenu({ top: 700, bottom: 732, right: 372 })

    expect(menu).toHaveStyle({ top: `${700 - 4 - 98}px`, left: `${375 - 8 - 192}px` })
  })

  it('위아래 화살표는 항목을 돌아가며 옮기고, Home과 End는 처음과 끝으로 간다', () => {
    const menu = renderMenu({ top: 200, bottom: 232, right: 351 })
    const stopwatch = screen.getByRole('menuitem', { name: '일반 타이머' })
    const pomodoro = screen.getByRole('menuitem', { name: '뽀모도로 타이머 최근' })

    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(stopwatch).toHaveFocus()
    fireEvent.keyDown(menu, { key: 'ArrowUp' })
    expect(pomodoro).toHaveFocus()
    fireEvent.keyDown(menu, { key: 'Home' })
    expect(stopwatch).toHaveFocus()
    fireEvent.keyDown(menu, { key: 'End' })
    expect(pomodoro).toHaveFocus()
  })

  it.each(['Escape', 'Tab'])('%s로 닫으면 포커스를 집중 시작 버튼으로 돌려준다', (key) => {
    const onClose = vi.fn()
    const menu = renderMenu({ top: 200, bottom: 232, right: 351 }, { onClose })

    fireEvent.keyDown(menu, { key })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(document.querySelector('[data-test-anchor]')).toHaveFocus()
  })
})
