import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { markSessionExpired } from '../lib/auth'
import { storageKeys } from '../lib/storageKeys'
import { useAuthStore } from '../store/authStore'
import { createTestQueryClient } from '../test/renderApp'
import AppLayoutGate from './AppLayoutGate'

const initialAuthStore = useAuthStore.getState()

function setOnboardingSeen(value: boolean) {
  window.localStorage.setItem(storageKeys.onboardingSeen, String(value))
}

// 앱 셸의 ScrollRestoration은 data router에서만 동작하므로 실제와 같은 방식으로 띄운다
function renderGate() {
  const router = createMemoryRouter([
    { path: '/', element: <AppLayoutGate /> },
    { path: '/boarding', element: <div>boarding page</div> },
    { path: '/login', element: <div>login page</div> },
  ])
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

describe('AppLayoutGate', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    // 앱 셸의 ScrollRestoration이 호출한다 (jsdom 미구현)
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    useAuthStore.setState(initialAuthStore, true)
    setOnboardingSeen(true)
  })

  afterEach(() => {
    useAuthStore.setState(initialAuthStore, true)
  })

  it('redirects to login when onboarding has not been completed', () => {
    setOnboardingSeen(false)
    useAuthStore.setState({ initialized: true, state: null })

    renderGate()

    expect(screen.getByText('login page')).toBeInTheDocument()
  })

  it('renders splash while auth initialization is pending', () => {
    useAuthStore.setState({ initialized: false, state: null })

    renderGate()

    // Splash는 FlowMate 로고를 보여준다 (로그인 페이지로 리다이렉트되지 않음)
    expect(screen.getByText('Flow')).toBeInTheDocument()
    expect(screen.queryByText('login page')).not.toBeInTheDocument()
  })

  it('redirects to login when auth is initialized without a user session', () => {
    useAuthStore.setState({ initialized: true, state: null })

    renderGate()

    expect(screen.getByText('login page')).toBeInTheDocument()
  })

  it('회원 복원이 서버 오류로 실패하면 로그인 화면 대신 다시 시도를 보여 준다', async () => {
    localStorage.setItem(storageKeys.authMode, 'member')
    const init = vi.fn(async () => {})
    useAuthStore.setState({ initialized: true, state: null, init })

    renderGate()

    expect(screen.getByText('로그인 정보를 불러오지 못했어요')).toBeInTheDocument()
    expect(screen.queryByText('login page')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(init).toHaveBeenCalledTimes(1)
  })

  it('회원 복원 실패 화면에서 로그인 화면으로 나갈 수 있다', async () => {
    localStorage.setItem(storageKeys.authMode, 'member')
    useAuthStore.setState({ initialized: true, state: null, init: vi.fn(async () => {}) })

    renderGate()

    await userEvent.click(screen.getByRole('button', { name: '로그인 화면으로' }))
    expect(screen.getByText('login page')).toBeInTheDocument()
  })

  it('회원 세션이 만료됐으면 로그인 화면으로 보낸다', () => {
    // 401/403이면 authStore가 회원 힌트를 지우고 만료 표시를 남긴다
    markSessionExpired()
    useAuthStore.setState({ initialized: true, state: null })

    renderGate()

    expect(screen.getByText('login page')).toBeInTheDocument()
  })

  it('renders the app shell when a session is available', () => {
    useAuthStore.setState({
      initialized: true,
      state: {
        type: 'member',
        accessToken: 'member-token',
        user: {
          id: 'user-1',
          email: null,
          nickname: 'Glenn',
        },
      },
    })

    renderGate()

    expect(screen.getByText('계획')).toBeInTheDocument()
    expect(screen.getByText('회고')).toBeInTheDocument()
    expect(screen.getByText('설정')).toBeInTheDocument()
  })
})
