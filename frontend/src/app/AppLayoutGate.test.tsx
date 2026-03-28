import { screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { storageKeys } from '../lib/storageKeys'
import { useAuthStore } from '../store/authStore'
import { renderApp } from '../test/renderApp'
import AppLayoutGate from './AppLayoutGate'

const initialAuthStore = useAuthStore.getState()

function setOnboardingSeen(value: boolean) {
  window.localStorage.setItem(storageKeys.onboardingSeen, String(value))
}

function renderGate() {
  return renderApp(
    <Routes>
      <Route path="/" element={<AppLayoutGate />} />
      <Route path="/boarding" element={<div>boarding page</div>} />
      <Route path="/login" element={<div>login page</div>} />
    </Routes>,
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

  it('renders nothing while auth initialization is pending', () => {
    useAuthStore.setState({ initialized: false, state: null })

    const { container } = renderGate()

    expect(container).toBeEmptyDOMElement()
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
