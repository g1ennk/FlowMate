import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { createTestQueryClient } from '../test/renderApp'
import AppLayout from './App'

function renderLayout() {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <AppLayout />,
        children: [
          { path: 'todos', element: <div>계획 화면</div> },
          { path: 'review', element: <div>회고 화면</div> },
          { path: 'settings', element: <div>설정 화면</div> },
        ],
      },
    ],
    { initialEntries: ['/review'] },
  )
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

function setScrollY(value: number) {
  Object.defineProperty(window, 'scrollY', { value, configurable: true, writable: true })
}

describe('AppLayout 스크롤', () => {
  let scrollTo: ReturnType<typeof vi.fn>

  beforeEach(() => {
    setScrollY(0)
    scrollTo = vi.fn()
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo
  })

  afterEach(() => {
    setScrollY(0)
    window.sessionStorage.clear()
  })

  it('탭을 옮기면 새 화면은 맨 위에서 시작한다', async () => {
    renderLayout()
    await screen.findByText('회고 화면')
    setScrollY(800)
    scrollTo.mockClear()

    await userEvent.click(screen.getByRole('link', { name: '계획' }))

    expect(await screen.findByText('계획 화면')).toBeInTheDocument()
    expect(scrollTo).toHaveBeenLastCalledWith(0, 0)
  })

  it('뒤로 가면 이전 화면의 스크롤 위치를 복원한다', async () => {
    const router = renderLayout()
    await screen.findByText('회고 화면')
    setScrollY(800)

    await userEvent.click(screen.getByRole('link', { name: '계획' }))
    await screen.findByText('계획 화면')
    setScrollY(0)
    scrollTo.mockClear()

    await act(() => router.navigate(-1))

    expect(await screen.findByText('회고 화면')).toBeInTheDocument()
    expect(scrollTo).toHaveBeenLastCalledWith(0, 800)
  })

  it('main은 따로 스크롤되지 않고 window 스크롤을 따른다', async () => {
    renderLayout()
    await screen.findByText('회고 화면')
    expect(screen.getByRole('main')).not.toHaveClass('overflow-y-auto')
  })
})

describe('AppLayout 테마 버튼', () => {
  it('콘텐츠 위에 테마 버튼을 띄우지 않는다', async () => {
    renderLayout()
    await screen.findByText('회고 화면')

    expect(screen.getByRole('link', { name: '설정' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /모드로 전환/ })).not.toBeInTheDocument()
  })
})
