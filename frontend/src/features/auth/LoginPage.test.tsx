import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TodoList } from '../../api/types'
import { queryKeys } from '../../lib/queryKeys'
import { storageKeys } from '../../lib/storageKeys'
import { useAuthStore } from '../../store/authStore'
import { createTestQueryClient, renderApp } from '../../test/renderApp'
import LoginPage from './LoginPage'

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

function renderLoginPage(queryClient = createTestQueryClient()) {
  return renderApp(
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/boarding" element={<div>boarding page</div>} />
      <Route path="/todos" element={<div>todos page</div>} />
    </Routes>,
    { route: '/login', queryClient },
  )
}

function queryClientWithTodos(items: TodoList['items']) {
  const queryClient = createTestQueryClient()
  // 앱처럼 할 일 화면을 떠난 뒤에도 목록 캐시가 잠시 남아 있게 한다 (테스트 기본값은 바로 지운다)
  queryClient.setQueryDefaults(queryKeys.todos(), { gcTime: 5 * 60_000 })
  queryClient.setQueryData<TodoList>(queryKeys.todos(), { items })
  return queryClient
}

const GUEST_TODO: TodoList['items'][number] = {
  id: '11111111-1111-4111-8111-111111111111',
  title: '게스트로 쓴 할 일',
  note: null,
  date: '2026-10-19',
  miniDay: 0,
  dayOrder: 0,
  isDone: false,
  sessionCount: 0,
  sessionFocusSeconds: 0,
  timerMode: null,
  createdAt: '2026-10-19T00:00:00Z',
  updatedAt: '2026-10-19T00:00:00Z',
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    useAuthStore.setState(initialAuthStore, true)
    useAuthStore.setState({
      initialized: true,
      state: {
        type: 'guest',
        token: 'guest-token',
      },
    })
    setOnboardingSeen(true)
    mocked.toast.mockReset()
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

  it('creates a guest session before navigating when there is no current auth state', async () => {
    const user = userEvent.setup()
    useAuthStore.setState({ state: null })

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ guestToken: 'new-guest-token' }),
      }),
    )

    renderLoginPage()

    await user.click(screen.getByRole('button', { name: /게스트로 둘러보기/ }))

    await waitFor(() => {
      expect(window.fetch).toHaveBeenCalledWith('/api/auth/guest/token', { method: 'POST' })
      expect(useAuthStore.getState().state).toEqual({ type: 'guest', token: 'new-guest-token' })
    })
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

  it('marks the browser as a guest user when continuing as a guest', async () => {
    const user = userEvent.setup()

    renderLoginPage()

    await user.click(screen.getByRole('button', { name: /게스트로 둘러보기/ }))

    await screen.findByText('todos page')
    expect(window.localStorage.getItem(storageKeys.guestStarted)).toBe('1')
  })

  it('does not ask a logged-out member (guest session without the guest-started flag)', async () => {
    const user = userEvent.setup()
    mockWindowLocation()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ state: 'oauth-state', authorizeUrl: 'https://kakao.example/authorize' }),
      }),
    )

    renderLoginPage()

    await user.click(screen.getByRole('button', { name: /카카오로 시작하기/ }))

    await waitFor(() => expect(window.fetch).toHaveBeenCalled())
    expect(window.confirm).not.toHaveBeenCalled()
  })

  it('asks for confirmation before a guest who used the app moves to Kakao login', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem(storageKeys.guestStarted, '1')
    vi.mocked(window.confirm).mockReturnValue(false)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    renderLoginPage()

    await user.click(screen.getByRole('button', { name: /카카오로 시작하기/ }))

    expect(window.confirm).toHaveBeenCalledWith(
      expect.stringContaining('게스트로 쓴 기록은 회원 계정으로 옮겨지지 않아요'),
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('asks a guest who has records even without the guest-started flag (guests from before the flag existed)', async () => {
    const user = userEvent.setup()
    vi.mocked(window.confirm).mockReturnValue(false)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    renderLoginPage(queryClientWithTodos([GUEST_TODO]))

    await user.click(screen.getByRole('button', { name: /카카오로 시작하기/ }))

    expect(window.confirm).toHaveBeenCalledWith(
      expect.stringContaining('게스트로 쓴 기록은 회원 계정으로 옮겨지지 않아요'),
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not ask a new guest right after logout whose todo list is empty', async () => {
    const user = userEvent.setup()
    mockWindowLocation()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ state: 'oauth-state', authorizeUrl: 'https://kakao.example/authorize' }),
      }),
    )

    renderLoginPage(queryClientWithTodos([]))

    await user.click(screen.getByRole('button', { name: /카카오로 시작하기/ }))

    await waitFor(() => expect(window.fetch).toHaveBeenCalled())
    expect(window.confirm).not.toHaveBeenCalled()
  })

  it('does not ask a first-time visitor for confirmation', async () => {
    const user = userEvent.setup()
    setOnboardingSeen(false)
    mockWindowLocation()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ state: 'oauth-state', authorizeUrl: 'https://kakao.example/authorize' }),
      }),
    )

    renderLoginPage()

    await user.click(screen.getByRole('button', { name: /카카오로 시작하기/ }))

    await waitFor(() => expect(window.fetch).toHaveBeenCalled())
    expect(window.confirm).not.toHaveBeenCalled()
  })

  it('explains that guest records are tied to this browser', () => {
    renderLoginPage()

    expect(screen.getByText('게스트 기록은 이 브라우저에서만 볼 수 있어요')).toBeInTheDocument()
  })

  it('ignores repeated taps while Kakao login is starting', async () => {
    const user = userEvent.setup()
    mockWindowLocation()
    let resolveFetch!: (value: unknown) => void
    const fetchMock = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve
        }),
    )
    vi.stubGlobal('fetch', fetchMock)

    renderLoginPage()

    const button = screen.getByRole('button', { name: /카카오로 시작하기/ })
    await user.click(button)
    await user.click(button)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    resolveFetch({ ok: true, json: async () => ({ state: 's', authorizeUrl: 'https://kakao.example' }) })
  })

  it('shows the splash instead of a blank screen before auth init finishes', () => {
    useAuthStore.setState({ initialized: false, state: null })

    const { container } = renderLoginPage()

    expect(container).not.toBeEmptyDOMElement()
  })

  it('explains an expired session and keeps the guest option secondary', () => {
    window.localStorage.setItem(storageKeys.sessionExpired, '1')
    useAuthStore.setState({ state: null })

    renderLoginPage()

    expect(
      screen.getByText('로그인이 만료됐어요. 다시 로그인하면 기록이 그대로 있어요'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /게스트로 둘러보기/ })).not.toHaveClass('border')
  })
})
