import { screen, waitFor } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { queryClient } from '../../app/queryClient'
import { useAuthStore } from '../../store/authStore'
import { renderApp } from '../../test/renderApp'
import AuthCallback from './AuthCallback'

const mocked = vi.hoisted(() => ({
  toast: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('react-hot-toast', () => ({
  default: Object.assign(mocked.toast, {
    error: mocked.toastError,
  }),
}))

const initialAuthStore = useAuthStore.getState()

function renderAuthCallback(route: string) {
  window.history.replaceState({}, '', route)
  return renderApp(
    <Routes>
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/login" element={<div>login page</div>} />
      <Route path="/todos" element={<div>todos page</div>} />
    </Routes>,
    { route },
  )
}

describe('AuthCallback', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    useAuthStore.setState(initialAuthStore, true)
    queryClient.clear()
    mocked.toast.mockReset()
    mocked.toastError.mockReset()
  })

  afterEach(() => {
    useAuthStore.setState(initialAuthStore, true)
    queryClient.clear()
  })

  it('redirects to login when the oauth state is missing or invalid', async () => {
    const login = vi.fn()
    window.sessionStorage.setItem('oauth_state', 'expected-state')
    useAuthStore.setState({ login })

    renderAuthCallback('/auth/callback?code=oauth-code&state=wrong-state')

    expect(await screen.findByText('login page')).toBeInTheDocument()
    expect(login).not.toHaveBeenCalled()
  })

  it('logs in and redirects to todos when the callback parameters are valid', async () => {
    const clearSpy = vi.spyOn(queryClient, 'clear')
    const login = vi.fn().mockResolvedValue(undefined)
    window.sessionStorage.setItem('oauth_state', 'expected-state')
    window.sessionStorage.setItem('oauth_provider', 'kakao')
    useAuthStore.setState({ login })

    renderAuthCallback('/auth/callback?code=oauth-code&state=expected-state')

    expect(await screen.findByText('todos page')).toBeInTheDocument()
    expect(login).toHaveBeenCalledWith('kakao', 'oauth-code', 'expected-state')
    expect(clearSpy).toHaveBeenCalled()
    expect(window.sessionStorage.getItem('oauth_state')).toBeNull()
    expect(window.sessionStorage.getItem('oauth_provider')).toBeNull()
  })

  it('returns to login when login exchange fails', async () => {
    const login = vi.fn().mockRejectedValue(new Error('oauth failed'))
    window.sessionStorage.setItem('oauth_state', 'expected-state')
    useAuthStore.setState({ login })

    renderAuthCallback('/auth/callback?code=oauth-code&state=expected-state')

    expect(await screen.findByText('login page')).toBeInTheDocument()
    await waitFor(() => {
      expect(login).toHaveBeenCalledWith('kakao', 'oauth-code', 'expected-state')
    })
  })

  it('tells the user the login was cancelled when Kakao returns access_denied', async () => {
    const login = vi.fn()
    window.sessionStorage.setItem('oauth_state', 'expected-state')
    useAuthStore.setState({ login })

    renderAuthCallback('/auth/callback?error=access_denied&state=expected-state')

    expect(await screen.findByText('login page')).toBeInTheDocument()
    expect(mocked.toast).toHaveBeenCalledWith('로그인을 취소했어요')
    expect(login).not.toHaveBeenCalled()
  })

  it('tells the user to try again when the login exchange fails', async () => {
    const login = vi.fn().mockRejectedValue(new Error('oauth failed'))
    window.sessionStorage.setItem('oauth_state', 'expected-state')
    useAuthStore.setState({ login })

    renderAuthCallback('/auth/callback?code=oauth-code&state=expected-state')

    expect(await screen.findByText('login page')).toBeInTheDocument()
    expect(mocked.toastError).toHaveBeenCalledWith('로그인하지 못했어요. 다시 시도해 주세요.')
  })

  it('tells the user to try again when the oauth state does not match', async () => {
    window.sessionStorage.setItem('oauth_state', 'expected-state')
    useAuthStore.setState({ login: vi.fn() })

    renderAuthCallback('/auth/callback?code=oauth-code&state=wrong-state')

    expect(await screen.findByText('login page')).toBeInTheDocument()
    expect(mocked.toastError).toHaveBeenCalledWith('로그인하지 못했어요. 다시 시도해 주세요.')
  })
})
