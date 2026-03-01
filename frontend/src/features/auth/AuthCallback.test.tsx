import { screen, waitFor } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { queryClient } from '../../app/queryClient'
import { useAuthStore } from '../../store/authStore'
import { renderApp } from '../../test/renderApp'
import AuthCallback from './AuthCallback'

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
})
