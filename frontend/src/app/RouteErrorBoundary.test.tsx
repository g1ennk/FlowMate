import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import RouteErrorBoundary from './RouteErrorBoundary'

const RELOAD_KEY = 'flowmate:chunk-reload-count'

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { value, configurable: true })
}

function renderWithError(error: Error) {
  const Thrower = () => {
    throw error
  }
  const router = createMemoryRouter(
    [{ path: '/', element: <Thrower />, errorElement: <RouteErrorBoundary /> }],
    { initialEntries: ['/'] },
  )
  return render(<RouterProvider router={router} />)
}

describe('RouteErrorBoundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    // 자동 새로고침 횟수를 다 쓴 상태로 두어 안내 화면을 바로 본다
    sessionStorage.setItem(RELOAD_KEY, '2')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    sessionStorage.clear()
    setOnline(true)
  })

  it('일반 오류는 다시 시도와 계획으로 가기를 보여 준다', async () => {
    renderWithError(new Error('boom'))

    expect(await screen.findByRole('heading', { name: '화면을 열지 못했어요' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '계획으로 가기' })).toBeInTheDocument()
  })

  it('온라인에서 화면 코드를 받지 못하면 업데이트 안내를 보여 준다', async () => {
    setOnline(true)
    renderWithError(new Error('Failed to fetch dynamically imported module: /assets/TodosPage.js'))

    expect(await screen.findByRole('heading', { name: '앱이 업데이트됐어요' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '새로고침' })).toBeInTheDocument()
  })

  it('오프라인에서 화면 코드를 받지 못하면 업데이트가 아니라 연결 문제라고 알린다', async () => {
    setOnline(false)
    renderWithError(new Error('Failed to fetch dynamically imported module: /assets/TodosPage.js'))

    expect(await screen.findByRole('heading', { name: '연결이 끊겨 화면을 불러오지 못했어요' })).toBeInTheDocument()
    expect(screen.queryByText('앱이 업데이트됐어요')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument()
  })
})
