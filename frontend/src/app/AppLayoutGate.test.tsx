import { render, screen } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
