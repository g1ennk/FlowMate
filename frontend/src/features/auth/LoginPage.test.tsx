import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { storageKeys } from '../../lib/storageKeys'
import { useAuthStore } from '../../store/authStore'
import { renderApp } from '../../test/renderApp'
import LoginPage from './LoginPage'

const mocked = vi.hoisted(() => ({
  toastError: vi.fn(),
}))

vi.mock('react-hot-toast', () => ({
  default: {
    error: mocked.toastError,
  },
}))

const initialAuthStore = useAuthStore.getState()
const originalLocation = window.location

function setOnboardingSeen(value: boolean) {
  window.localStorage.setItem(storageKeys.onboardingSeen, String(value))
}

function mockWindowLocation(initialHref = 'http://localhost/login') {
  let href = initialHref

  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      get href() {
        return href
      },
      set href(next: string) {
        href = next
      },
    },
  })

  return () => href
}

function renderLoginPage() {
  return renderApp(
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/boarding" element={<div>boarding page</div>} />
      <Route path="/todos" element={<div>todos page</div>} />
    </Routes>,
    { route: '/login' },
  )
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    useAuthStore.setState(initialAuthStore, true)
    useAuthStore.setState({
      initialized: true,
      state: {
        type: 'guest',
        token: 'guest-token',
      },
    })
    setOnboardingSeen(true)
    mocked.toastError.mockReset()
  })

  afterEach(() => {
    useAuthStore.setState(initialAuthStore, true)
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    })
  })

  it('redirects to todos when a member session already exists', () => {
    useAuthStore.setState({
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

    renderLoginPage()

    expect(screen.getByText('todos page')).toBeInTheDocument()
  })

  it('navigates to todos when continuing as a guest', async () => {
    const user = userEvent.setup()

    renderLoginPage()

    await user.click(screen.getByRole('button', { name: /게스트로 둘러보기/ }))

    expect(await screen.findByText('todos page')).toBeInTheDocument()
  })

  it('starts Kakao login by storing oauth state and changing the browser location', async () => {
    const user = userEvent.setup()
    const readHref = mockWindowLocation()

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          state: 'oauth-state',
          authorizeUrl: 'https://kakao.example/authorize',
        }),
      }),
    )

    renderLoginPage()

    await user.click(screen.getByRole('button', { name: /카카오로 시작하기/ }))

    await waitFor(() => {
      expect(window.fetch).toHaveBeenCalledWith('/api/auth/kakao/authorize-url')
      expect(window.sessionStorage.getItem('oauth_state')).toBe('oauth-state')
      expect(window.sessionStorage.getItem('oauth_provider')).toBe('kakao')
      expect(readHref()).toBe('https://kakao.example/authorize')
    })
  })

  it('shows an error toast when Kakao login cannot be started', async () => {
    const user = userEvent.setup()

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({}),
      }),
    )

    renderLoginPage()

    await user.click(screen.getByRole('button', { name: /카카오로 시작하기/ }))

    await waitFor(() => {
      expect(mocked.toastError).toHaveBeenCalledWith(
        '카카오 로그인을 시작할 수 없습니다. 잠시 후 다시 시도해주세요.',
      )
    })
  })
})
