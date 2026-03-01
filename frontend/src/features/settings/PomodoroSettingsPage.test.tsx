import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { storageKeys } from '../../lib/storageKeys'
import { useAuthStore } from '../../store/authStore'
import { renderApp } from '../../test/renderApp'
import PomodoroSettingsPage from './PomodoroSettingsPage'

const initialAuthStore = useAuthStore.getState()

function readStoredSettings() {
  const raw = window.localStorage.getItem(storageKeys.settings('local'))
  return raw ? JSON.parse(raw) : null
}

describe('PomodoroSettingsPage', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    useAuthStore.setState(initialAuthStore, true)
  })

  afterEach(() => {
    useAuthStore.setState(initialAuthStore, true)
  })

  it('renders the guest CTA and the current settings values', async () => {
    useAuthStore.setState({
      initialized: true,
      state: {
        type: 'guest',
        token: 'guest-token',
      },
    })

    renderApp(<PomodoroSettingsPage />, { route: '/settings' })

    expect(await screen.findByText('설정')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Flow 시간.*25분/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '로그인' })).toBeInTheDocument()
  })

  it('saves automation and flow settings for a signed-in user', async () => {
    const user = userEvent.setup()

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

    renderApp(<PomodoroSettingsPage />, { route: '/settings' })

    expect(await screen.findByRole('button', { name: '로그아웃' })).toBeInTheDocument()

    await waitFor(() => {
      expect(
        screen.getByRole('switch', { name: /휴식 시간 자동 시작/ }),
      ).not.toBeDisabled()
    })

    await user.click(screen.getByRole('switch', { name: /휴식 시간 자동 시작/ }))

    await waitFor(() => {
      expect(readStoredSettings()?.automation.autoStartBreak).toBe(true)
    })

    await user.click(screen.getByRole('button', { name: /Flow 시간.*25분/ }))
    await user.click(await screen.findByRole('button', { name: '30분' }))

    await waitFor(() => {
      expect(readStoredSettings()?.pomodoroSession.flowMin).toBe(30)
    })

    expect(screen.getByRole('button', { name: /Flow 시간.*30분/ })).toBeInTheDocument()
  })
})
