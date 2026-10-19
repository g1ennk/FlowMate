import type { PropsWithChildren } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, renderHook } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useThemeStore } from '../store/themeStore'
import { useKeyboardShortcuts } from './useKeyboardShortcuts'

const initialThemeState = useThemeStore.getState()

function wrapper({ children }: PropsWithChildren) {
  return <MemoryRouter initialEntries={['/todos']}>{children}</MemoryRouter>
}

describe('useKeyboardShortcuts 테마 단축키', () => {
  const setTheme = vi.fn()

  beforeEach(() => {
    useThemeStore.setState({ setTheme })
  })

  afterEach(() => {
    useThemeStore.setState(initialThemeState, true)
    setTheme.mockReset()
  })

  it('영문 입력 상태에서 d를 누르면 테마를 바꾼다', () => {
    renderHook(() => useKeyboardShortcuts(), { wrapper })
    fireEvent.keyDown(window, { key: 'd', code: 'KeyD' })
    expect(setTheme).toHaveBeenCalledTimes(1)
  })

  it('한글 입력 상태에서 같은 자리(ㅇ)를 눌러도 테마를 바꾼다', () => {
    renderHook(() => useKeyboardShortcuts(), { wrapper })
    fireEvent.keyDown(window, { key: 'ㅇ', code: 'KeyD' })
    expect(setTheme).toHaveBeenCalledTimes(1)
  })

  it('입력창에 포커스가 있으면 테마를 바꾸지 않는다', () => {
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    renderHook(() => useKeyboardShortcuts(), { wrapper })
    fireEvent.keyDown(window, { key: 'ㅇ', code: 'KeyD' })
    expect(setTheme).not.toHaveBeenCalled()
    input.remove()
  })
})
