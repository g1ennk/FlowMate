import { act, screen, waitFor, within } from '@testing-library/react'
import { onlineManager } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { toast } from 'react-hot-toast'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AutomationSettings, PomodoroSessionSettings, Settings } from '../../api/types'
import { defaultMiniDaysSettings } from '../../lib/miniDays'
import { storageKeys } from '../../lib/storageKeys'
import { server } from '../../mocks/server'
import { useAuthStore } from '../../store/authStore'
import { useThemeStore } from '../../store/themeStore'
import { Route, Routes } from 'react-router-dom'
import { renderApp } from '../../test/renderApp'
import PomodoroSettingsPage from './PomodoroSettingsPage'

// toast()를 직접 부르는 경우(정보 토스트)도 확인할 수 있게 함수 자체를 감싼다.
vi.mock('react-hot-toast', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-hot-toast')>()
  return { ...actual, toast: Object.assign(vi.fn(), actual.toast) }
})

const initialAuthStore = useAuthStore.getState()

function signInAsMember() {
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
}

// 저장 요청이 느린 서버. 요청이 도착한 순서대로 서버 값을 통째로 덮어쓴다(전체 덮어쓰기 PUT).
function useSlowSettingsServer() {
  const serverState: Settings = {
    pomodoroSession: { flowMin: 25, breakMin: 5, longBreakMin: 15, cycleEvery: 4 },
    automation: { autoStartBreak: false, autoStartSession: false },
    miniDays: defaultMiniDaysSettings,
  }
  const putCount = { value: 0 }

  server.use(
    http.get('/api/settings', () => HttpResponse.json(serverState)),
    http.put('/api/settings/automation', async ({ request }) => {
      putCount.value += 1
      const body = (await request.json()) as AutomationSettings
      serverState.automation = body
      await delay(150)
      return HttpResponse.json(body)
    }),
    http.put('/api/settings/pomodoro-session', async ({ request }) => {
      putCount.value += 1
      const body = (await request.json()) as PomodoroSessionSettings
      serverState.pomodoroSession = body
      await delay(150)
      return HttpResponse.json(body)
    }),
  )

  return { serverState, putCount }
}

function isSwitchOn(name: RegExp) {
  return screen.getByRole('switch', { name }).getAttribute('aria-checked') === 'true'
}

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

    expect(await screen.findByRole('heading', { level: 1, name: '설정' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /집중 시간.*25분/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '카카오로 로그인' })).toBeInTheDocument()
  })

  it('keeps the guest status and where guest records live in the account section', async () => {
    const user = userEvent.setup()
    useAuthStore.setState({ initialized: true, state: { type: 'guest', token: 'guest-token' } })

    renderApp(
      <Routes>
        <Route path="/settings" element={<PomodoroSettingsPage />} />
        <Route path="/login" element={<div>login page</div>} />
      </Routes>,
      { route: '/settings' },
    )

    expect(await screen.findByRole('heading', { level: 2, name: '계정' })).toBeInTheDocument()
    expect(screen.getByText('게스트로 쓰는 중')).toBeInTheDocument()
    expect(screen.getByText('기록은 이 브라우저에만 남아요')).toBeInTheDocument()
    // 설정에는 코치마크가 없다(섹션 설명이 같은 일을 한다)
    expect(screen.queryByRole('button', { name: '힌트 닫기' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '카카오로 로그인' }))
    expect(await screen.findByText('login page')).toBeInTheDocument()
  })

  it('shows 기본값 복원 only for a section whose values differ from the defaults', async () => {
    signInAsMember()
    const { serverState } = useSlowSettingsServer()

    const { unmount } = renderApp(<PomodoroSettingsPage />, { route: '/settings' })
    await screen.findByRole('button', { name: /집중 시간.*25분/ })
    await waitFor(() => expect(screen.getByRole('button', { name: /집중 시간.*25분/ })).not.toBeDisabled())
    expect(screen.queryByRole('button', { name: '기본값 복원' })).not.toBeInTheDocument()
    unmount()

    serverState.pomodoroSession = { ...serverState.pomodoroSession, flowMin: 30 }
    renderApp(<PomodoroSettingsPage />, { route: '/settings' })
    await screen.findByRole('button', { name: /집중 시간.*30분/ })

    expect(await screen.findAllByRole('button', { name: '기본값 복원' })).toHaveLength(1)
  })

  it('기본값 복원 뒤 버튼이 사라져도 포커스를 그 섹션 첫 행으로 옮긴다', async () => {
    const user = userEvent.setup()
    signInAsMember()
    const { serverState } = useSlowSettingsServer()
    serverState.pomodoroSession = { ...serverState.pomodoroSession, flowMin: 30 }

    renderApp(<PomodoroSettingsPage />, { route: '/settings' })
    await user.click(await screen.findByRole('button', { name: '기본값 복원' }))
    const sheet = screen.getByRole('dialog', { name: '뽀모도로 설정을 기본값으로 복원할까요?' })
    await user.click(within(sheet).getByRole('button', { name: '기본값으로 복원' }))

    await waitFor(() => expect(screen.queryByRole('button', { name: '기본값 복원' })).not.toBeInTheDocument())
    await waitFor(() => expect(screen.getByRole('button', { name: /집중 시간.*25분/ })).toHaveFocus())
  })

  it('keeps the break sheet open after a choice, saves it at once and moves the check', async () => {
    const user = userEvent.setup()
    signInAsMember()
    const { serverState } = useSlowSettingsServer()

    const { queryClient } = renderApp(<PomodoroSettingsPage />, { route: '/settings' })
    const breakRow = await screen.findByRole('button', { name: /휴식 시간.*짧은 5분, 긴 15분/ })
    await waitFor(() => expect(breakRow).not.toBeDisabled())
    await user.click(breakRow)

    const sheet = await screen.findByRole('dialog', { name: '휴식 시간' })
    const short = within(sheet).getByRole('group', { name: '짧은 휴식' })
    const long = within(sheet).getByRole('group', { name: '긴 휴식' })
    expect(within(short).getByRole('button', { name: '5분' })).toHaveAttribute('aria-current', 'true')

    await user.click(within(short).getByRole('button', { name: '10분' }))
    expect(screen.getByRole('dialog', { name: '휴식 시간' })).toBeInTheDocument()
    expect(within(short).getByRole('button', { name: '10분' })).toHaveAttribute('aria-current', 'true')
    expect(within(short).getByRole('button', { name: '5분' })).not.toHaveAttribute('aria-current')

    await user.click(within(long).getByRole('button', { name: '30분' }))
    await waitFor(() => expect(queryClient.isMutating()).toBe(0))

    expect(serverState.pomodoroSession).toMatchObject({ breakMin: 10, longBreakMin: 30 })
    expect(screen.getByRole('dialog', { name: '휴식 시간' })).toBeInTheDocument()
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
        screen.getByRole('switch', { name: /휴식 자동 시작/ }),
      ).not.toBeDisabled()
    })

    await user.click(screen.getByRole('switch', { name: /휴식 자동 시작/ }))

    await waitFor(() => {
      expect(readStoredSettings()?.automation.autoStartBreak).toBe(true)
    })

    await user.click(screen.getByRole('button', { name: /집중 시간.*25분/ }))
    await user.click(await screen.findByRole('button', { name: '30분' }))

    await waitFor(() => {
      expect(readStoredSettings()?.pomodoroSession.flowMin).toBe(30)
    })

    expect(screen.getByRole('button', { name: /집중 시간.*30분/ })).toBeInTheDocument()
  })

  it('saves 120 minutes as the maximum flow preset for a signed-in user', async () => {
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

    const flowRow = await screen.findByRole('button', { name: /집중 시간.*25분/ })
    await waitFor(() => expect(flowRow).not.toBeDisabled())

    await user.click(flowRow)
    await user.click(await screen.findByRole('button', { name: '120분' }))

    await waitFor(() => {
      expect(readStoredSettings()?.pomodoroSession.flowMin).toBe(120)
    })

    expect(screen.getByRole('button', { name: /집중 시간.*120분/ })).toBeInTheDocument()
  })

  it('saves 60 minutes as the maximum long break preset for a signed-in user', async () => {
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

    const breakRow = await screen.findByRole('button', { name: /휴식 시간.*짧은 5분, 긴 15분/ })
    await waitFor(() => expect(breakRow).not.toBeDisabled())

    await user.click(breakRow)
    await user.click(await screen.findByRole('button', { name: '60분' }))

    await waitFor(() => {
      expect(readStoredSettings()?.pomodoroSession.longBreakMin).toBe(60)
    })

    expect(screen.getByRole('button', { name: /휴식 시간.*짧은 5분, 긴 60분/ })).toBeInTheDocument()
  })

  it('keeps the screen and the server equal when the same switch is tapped twice quickly', async () => {
    const user = userEvent.setup()
    signInAsMember()
    const { serverState } = useSlowSettingsServer()

    const { queryClient } = renderApp(<PomodoroSettingsPage />, { route: '/settings' })
    const breakSwitch = await screen.findByRole('switch', { name: /휴식 자동 시작/ })
    await waitFor(() => expect(breakSwitch).not.toBeDisabled())

    await user.click(breakSwitch)
    await user.click(breakSwitch)

    await waitFor(() => expect(queryClient.isMutating()).toBe(0))
    await waitFor(() => expect(queryClient.isFetching()).toBe(0))

    expect(isSwitchOn(/휴식 자동 시작/)).toBe(false)
    expect(serverState.automation.autoStartBreak).toBe(false)
  })

  it('does not undo the first switch when a second switch is tapped quickly', async () => {
    const user = userEvent.setup()
    signInAsMember()
    const { serverState } = useSlowSettingsServer()

    const { queryClient } = renderApp(<PomodoroSettingsPage />, { route: '/settings' })
    const breakSwitch = await screen.findByRole('switch', { name: /휴식 자동 시작/ })
    await waitFor(() => expect(breakSwitch).not.toBeDisabled())

    await user.click(breakSwitch)
    await user.click(screen.getByRole('switch', { name: /집중 자동 시작/ }))

    await waitFor(() => expect(queryClient.isMutating()).toBe(0))
    await waitFor(() => expect(queryClient.isFetching()).toBe(0))

    expect(isSwitchOn(/휴식 자동 시작/)).toBe(true)
    expect(isSwitchOn(/집중 자동 시작/)).toBe(true)
    expect(serverState.automation).toEqual({ autoStartBreak: true, autoStartSession: true })
  })

  it('sends saves one at a time so a slower earlier save cannot land last', async () => {
    const user = userEvent.setup()
    signInAsMember()
    const { serverState } = useSlowSettingsServer()
    let requestCount = 0
    server.use(
      // 첫 요청만 느리고, 서버는 요청 처리가 끝날 때 값을 쓴다.
      http.put('/api/settings/automation', async ({ request }) => {
        requestCount += 1
        const body = (await request.json()) as AutomationSettings
        await delay(requestCount === 1 ? 300 : 30)
        serverState.automation = body
        return HttpResponse.json(body)
      }),
    )

    const { queryClient } = renderApp(<PomodoroSettingsPage />, { route: '/settings' })
    const breakSwitch = await screen.findByRole('switch', { name: /휴식 자동 시작/ })
    await waitFor(() => expect(breakSwitch).not.toBeDisabled())

    await user.click(breakSwitch)
    await user.click(screen.getByRole('switch', { name: /집중 자동 시작/ }))

    await waitFor(() => expect(queryClient.isMutating()).toBe(0))
    await waitFor(() => expect(queryClient.isFetching()).toBe(0))

    expect(isSwitchOn(/휴식 자동 시작/)).toBe(true)
    expect(isSwitchOn(/집중 자동 시작/)).toBe(true)
    expect(serverState.automation).toEqual({ autoStartBreak: true, autoStartSession: true })
  })

  it('keeps both switch changes when a refetch lands while saves are queued', async () => {
    const user = userEvent.setup()
    signInAsMember()
    const { serverState } = useSlowSettingsServer()
    server.use(
      // 서버는 요청 처리가 끝날 때 값을 쓴다. 그 전에 온 GET은 이전 값을 돌려준다.
      http.put('/api/settings/automation', async ({ request }) => {
        const body = (await request.json()) as AutomationSettings
        await delay(200)
        serverState.automation = body
        return HttpResponse.json(body)
      }),
    )

    const { queryClient } = renderApp(<PomodoroSettingsPage />, { route: '/settings' })
    const breakSwitch = await screen.findByRole('switch', { name: /휴식 자동 시작/ })
    await waitFor(() => expect(breakSwitch).not.toBeDisabled())

    await user.click(breakSwitch)
    await user.click(screen.getByRole('switch', { name: /집중 자동 시작/ }))
    // 당겨서 새로고침이나 포커스 refetch가 첫 저장이 끝나기 전에 끼어든다.
    await queryClient.invalidateQueries()

    await waitFor(() => expect(queryClient.isMutating()).toBe(0))
    await waitFor(() => expect(queryClient.isFetching()).toBe(0))

    expect(serverState.automation).toEqual({ autoStartBreak: true, autoStartSession: true })
    expect(isSwitchOn(/휴식 자동 시작/)).toBe(true)
    expect(isSwitchOn(/집중 자동 시작/)).toBe(true)
  })

  it('shows the last saved values when every queued save and the refetch fail', async () => {
    const user = userEvent.setup()
    signInAsMember()
    useSlowSettingsServer()

    const { queryClient } = renderApp(<PomodoroSettingsPage />, { route: '/settings' })
    const breakSwitch = await screen.findByRole('switch', { name: /휴식 자동 시작/ })
    await waitFor(() => expect(breakSwitch).not.toBeDisabled())

    server.use(
      http.put('/api/settings/automation', async () => {
        await delay(50)
        return HttpResponse.json({ message: 'boom' }, { status: 500 })
      }),
      http.get('/api/settings', () => HttpResponse.json({ message: 'boom' }, { status: 500 })),
    )

    await user.click(breakSwitch)
    await user.click(screen.getByRole('switch', { name: /집중 자동 시작/ }))

    await waitFor(() => expect(queryClient.isMutating()).toBe(0))
    await waitFor(() => expect(queryClient.isFetching()).toBe(0))

    expect(isSwitchOn(/휴식 자동 시작/)).toBe(false)
    expect(isSwitchOn(/집중 자동 시작/)).toBe(false)
  })

  it('notifies once by the final result when an earlier save fails and a later one succeeds', async () => {
    const user = userEvent.setup()
    const toastError = vi.spyOn(toast, 'error')
    const toastSuccess = vi.spyOn(toast, 'success')
    signInAsMember()
    const { serverState } = useSlowSettingsServer()
    let requestCount = 0
    server.use(
      http.put('/api/settings/automation', async ({ request }) => {
        requestCount += 1
        const body = (await request.json()) as AutomationSettings
        await delay(50)
        if (requestCount === 1) return HttpResponse.json({ message: 'boom' }, { status: 500 })
        serverState.automation = body
        return HttpResponse.json(body)
      }),
    )

    const { queryClient } = renderApp(<PomodoroSettingsPage />, { route: '/settings' })
    const breakSwitch = await screen.findByRole('switch', { name: /휴식 자동 시작/ })
    await waitFor(() => expect(breakSwitch).not.toBeDisabled())

    await user.click(breakSwitch)
    await user.click(screen.getByRole('switch', { name: /집중 자동 시작/ }))

    await waitFor(() => expect(queryClient.isMutating()).toBe(0))
    await waitFor(() => expect(queryClient.isFetching()).toBe(0))

    // 뒤 저장이 같은 묶음(자동화)의 전체 값을 보내므로 앞 변경도 함께 저장된다.
    expect(serverState.automation).toEqual({ autoStartBreak: true, autoStartSession: true })
    expect(toastError).not.toHaveBeenCalled()
    expect(toastSuccess).toHaveBeenCalledTimes(1)
  })

  it('does not undo the first sheet choice when a second sheet choice follows quickly', async () => {
    const user = userEvent.setup()
    signInAsMember()
    const { serverState } = useSlowSettingsServer()

    const { queryClient } = renderApp(<PomodoroSettingsPage />, { route: '/settings' })
    const flowRow = await screen.findByRole('button', { name: /집중 시간.*25분/ })
    await waitFor(() => expect(flowRow).not.toBeDisabled())

    await user.click(flowRow)
    await user.click(await screen.findByRole('button', { name: '30분' }))
    await user.click(screen.getByRole('button', { name: /긴 휴식까지/ }))
    await user.click(await screen.findByRole('button', { name: '6회' }))

    await waitFor(() => expect(queryClient.isMutating()).toBe(0))
    await waitFor(() => expect(queryClient.isFetching()).toBe(0))

    expect(screen.getByRole('button', { name: /집중 시간.*30분/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /긴 휴식까지.*6회/ })).toBeInTheDocument()
    expect(serverState.pomodoroSession).toMatchObject({ flowMin: 30, cycleEvery: 6 })
  })

  it('shows a load error with a retry button and blocks editing when settings fail to load', async () => {
    const user = userEvent.setup()
    signInAsMember()
    const { putCount } = useSlowSettingsServer()
    server.use(
      http.get('/api/settings', () => HttpResponse.json({ message: 'boom' }, { status: 500 }), { once: true }),
    )

    renderApp(<PomodoroSettingsPage />, { route: '/settings' })

    expect(await screen.findByText('설정을 불러오지 못했어요')).toBeInTheDocument()
    // 실패 안내는 상자 없는 한 줄(InlineStatus)이다(§3-2)
    expect(screen.getByRole('alert').className).not.toMatch(/(^|\s)(bg|rounded|border)-/)
    // 불러오지 못한 값은 기본값으로 꾸미지 않는다. 값 자리는 "—"(읽을 때는 "알 수 없음"), 스위치는 숨긴다.
    // 값을 모르는 행은 모두 같은 모양의 누를 수 없는 줄이다(뽀모도로·자동화·미니 데이 3+2+3)
    expect(screen.getAllByText('—')).toHaveLength(8)
    expect(screen.getAllByText('알 수 없음')).toHaveLength(8)
    expect(screen.queryByRole('button', { name: /집중 시간|휴식 시간|긴 휴식까지|오전/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    expect(screen.queryByText(/25분/)).not.toBeInTheDocument()
    expect(putCount.value).toBe(0)

    await user.click(screen.getByRole('button', { name: '다시 시도' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /집중 시간.*25분/ })).not.toBeDisabled()
    })
    expect(screen.getByRole('switch', { name: /휴식 자동 시작/ })).toBeInTheDocument()
    expect(screen.queryByText('설정을 불러오지 못했어요')).not.toBeInTheDocument()
  })

  it('says settings could not be loaded offline instead of leaving blank values, and loads after reconnecting', async () => {
    signInAsMember()
    useSlowSettingsServer()
    onlineManager.setOnline(false)
    try {
      renderApp(<PomodoroSettingsPage />, { route: '/settings' })

      expect(await screen.findByText('오프라인이라 설정을 불러오지 못했어요. 연결되면 다시 불러와요.')).toBeInTheDocument()
      expect(screen.queryByRole('switch')).not.toBeInTheDocument()

      act(() => onlineManager.setOnline(true))
      expect(await screen.findByRole('switch', { name: /휴식 자동 시작/ })).toBeInTheDocument()
      expect(screen.queryByText(/오프라인이라 설정을/)).not.toBeInTheDocument()
    } finally {
      onlineManager.setOnline(true)
    }
  })

  it('blocks editing while settings are still loading', async () => {
    signInAsMember()
    server.use(
      http.get('/api/settings', async () => {
        await delay('infinite')
        return HttpResponse.json({})
      }),
    )

    renderApp(<PomodoroSettingsPage />, { route: '/settings' })

    expect(await screen.findByText('설정')).toBeInTheDocument()
    expect(screen.getByText('집중 시간')).toBeInTheDocument()
    expect(screen.getAllByText('알 수 없음')).toHaveLength(8)
    expect(screen.queryByRole('button', { name: /집중 시간|휴식 시간|긴 휴식까지|오전/ })).not.toBeInTheDocument()
  })

  it('rolls back the switch and shows an error toast when saving fails', async () => {
    const user = userEvent.setup()
    const toastError = vi.spyOn(toast, 'error')
    signInAsMember()
    useSlowSettingsServer()
    server.use(
      http.put('/api/settings/automation', async () => {
        await delay(50)
        return HttpResponse.json({ message: 'boom' }, { status: 500 })
      }),
    )

    const { queryClient } = renderApp(<PomodoroSettingsPage />, { route: '/settings' })
    const breakSwitch = await screen.findByRole('switch', { name: /휴식 자동 시작/ })
    await waitFor(() => expect(breakSwitch).not.toBeDisabled())

    await user.click(breakSwitch)

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('설정을 저장하지 못했어요. 다시 시도해 주세요.'))
    await waitFor(() => expect(queryClient.isMutating()).toBe(0))
    expect(isSwitchOn(/휴식 자동 시작/)).toBe(false)
  })

  it('shows an error toast when saving a mini day fails', async () => {
    const user = userEvent.setup()
    const toastError = vi.spyOn(toast, 'error')
    signInAsMember()
    useSlowSettingsServer()
    server.use(
      http.put('/api/settings/mini-days', () => HttpResponse.json({ message: 'boom' }, { status: 500 })),
    )

    renderApp(<PomodoroSettingsPage />, { route: '/settings' })
    const morningRow = await screen.findByRole('button', { name: /오전/ })
    await waitFor(() => expect(morningRow).not.toBeDisabled())

    await user.click(morningRow)
    const labelInput = await screen.findByPlaceholderText('미니 데이 1')
    await user.clear(labelInput)
    await user.type(labelInput, '아침')
    await user.keyboard('{Escape}')

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('미니 데이를 저장하지 못했어요. 다시 시도해 주세요.'))
  })
  it('shows a 24:00 end as 24:00 in the one range format and keeps it when the end wheel is touched', async () => {
    const user = userEvent.setup()
    signInAsMember()
    useSlowSettingsServer()

    renderApp(<PomodoroSettingsPage />, { route: '/settings' })
    const eveningRow = await screen.findByRole('button', { name: /저녁/ })
    await waitFor(() => expect(eveningRow).not.toBeDisabled())
    // 미니 데이 구간은 계획과 같은 "18:00–24:00" 한 형식이다(C8)
    expect(eveningRow).toHaveAccessibleName(/18:00–24:00/)

    await user.click(eveningRow)
    const endCard = await screen.findByRole('radio', { name: /종료/ })
    expect(endCard).toHaveAccessibleName('종료 24:00')

    await user.click(endCard)
    await user.click(within(screen.getByLabelText('분 선택')).getByRole('button', { name: '00' }))

    expect(screen.getByRole('radio', { name: /종료/ })).toHaveAccessibleName('종료 24:00')
    expect(screen.queryByText('종료는 시작보다 늦어야 해요')).not.toBeInTheDocument()
  })

  it('saves midnight as 24:00 when 24 is picked for the end', async () => {
    const user = userEvent.setup()
    signInAsMember()
    const { serverState } = useSlowSettingsServer()
    server.use(
      http.put('/api/settings/mini-days', async ({ request }) => {
        const body = (await request.json()) as Settings['miniDays']
        serverState.miniDays = body
        return HttpResponse.json(body)
      }),
    )

    renderApp(<PomodoroSettingsPage />, { route: '/settings' })
    const afternoonRow = await screen.findByRole('button', { name: /^오후/ })
    await waitFor(() => expect(afternoonRow).not.toBeDisabled())

    await user.click(afternoonRow)
    await user.click(await screen.findByRole('radio', { name: /종료/ }))
    await user.click(within(screen.getByLabelText('시 선택')).getByRole('button', { name: '24' }))

    expect(screen.getByRole('radio', { name: /종료/ })).toHaveAccessibleName('종료 24:00')
    expect(screen.queryByText('종료는 시작보다 늦어야 해요')).not.toBeInTheDocument()

    await user.keyboard('{Escape}')
    await waitFor(() => expect(serverState.miniDays.day2.end).toBe('24:00'))
  })
  it('saves mini day changes when the sheet is closed', async () => {
    const user = userEvent.setup()
    signInAsMember()
    const { serverState } = useSlowSettingsServer()
    server.use(
      http.put('/api/settings/mini-days', async ({ request }) => {
        const body = (await request.json()) as Settings['miniDays']
        await delay(150)
        serverState.miniDays = body
        return HttpResponse.json(body)
      }),
    )

    renderApp(<PomodoroSettingsPage />, { route: '/settings' })
    const morningRow = await screen.findByRole('button', { name: /오전/ })
    await waitFor(() => expect(morningRow).not.toBeDisabled())

    await user.click(morningRow)
    expect(screen.queryByRole('button', { name: '저장' })).not.toBeInTheDocument()
    const labelInput = await screen.findByPlaceholderText('미니 데이 1')
    await user.clear(labelInput)
    await user.type(labelInput, '아침')
    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('heading', { name: '미니 데이 설정' })).not.toBeInTheDocument())
    // 저장이 끝나기 전에도 목록에는 바뀐 값이 보인다.
    expect(screen.getByRole('button', { name: /아침/ })).toBeInTheDocument()
    await waitFor(() => expect(serverState.miniDays.day1.label).toBe('아침'))
  })

  it('saves an open mini day edit when the user leaves the settings screen', async () => {
    const user = userEvent.setup()
    signInAsMember()
    const { serverState } = useSlowSettingsServer()
    server.use(
      http.put('/api/settings/mini-days', async ({ request }) => {
        const body = (await request.json()) as Settings['miniDays']
        serverState.miniDays = body
        return HttpResponse.json(body)
      }),
    )

    const view = renderApp(<PomodoroSettingsPage />, { route: '/settings' })
    const morningRow = await screen.findByRole('button', { name: /오전/ })
    await waitFor(() => expect(morningRow).not.toBeDisabled())

    await user.click(morningRow)
    const labelInput = await screen.findByPlaceholderText('미니 데이 1')
    await user.clear(labelInput)
    await user.type(labelInput, '아침')
    view.unmount()

    await waitFor(() => expect(serverState.miniDays.day1.label).toBe('아침'))
  })

  it('discards an invalid mini day edit when the sheet is closed and says it was not saved', async () => {
    const user = userEvent.setup()
    signInAsMember()
    const { serverState } = useSlowSettingsServer()
    let putCount = 0
    server.use(
      http.put('/api/settings/mini-days', async ({ request }) => {
        putCount += 1
        const body = (await request.json()) as Settings['miniDays']
        serverState.miniDays = body
        return HttpResponse.json(body)
      }),
    )

    renderApp(<PomodoroSettingsPage />, { route: '/settings' })
    const morningRow = await screen.findByRole('button', { name: /오전/ })
    await waitFor(() => expect(morningRow).not.toBeDisabled())

    await user.click(morningRow)
    await user.click(await screen.findByRole('radio', { name: /종료/ }))
    await user.click(within(screen.getByLabelText('시 선택')).getByRole('button', { name: '05' }))
    expect(screen.getByText('종료는 시작보다 늦어야 해요')).toBeInTheDocument()
    expect(screen.getByText('오류를 고치지 않고 닫으면 저장되지 않아요')).toBeInTheDocument()
    vi.mocked(toast).mockClear()
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('heading', { name: '미니 데이 설정' })).not.toBeInTheDocument()
    expect(toast).toHaveBeenCalledWith('저장하지 않았어요', expect.anything())
    expect(screen.getByRole('button', { name: /오전.*06:00–12:00/ })).toBeInTheDocument()
    expect(putCount).toBe(0)
  })

  it('edits start and end with one SegmentToggle and a 44px wheel, without boxes inside boxes', async () => {
    const user = userEvent.setup()
    signInAsMember()
    useSlowSettingsServer()

    renderApp(<PomodoroSettingsPage />, { route: '/settings' })
    const morningRow = await screen.findByRole('button', { name: /오전/ })
    await waitFor(() => expect(morningRow).not.toBeDisabled())
    await user.click(morningRow)

    const sheet = await screen.findByRole('dialog', { name: '미니 데이 설정' })
    const segment = within(sheet).getByRole('radiogroup', { name: '고칠 시각' })
    expect(within(segment).getByRole('radio', { name: '시작 06:00' })).toHaveAttribute('aria-checked', 'true')
    expect(within(segment).getByRole('radio', { name: '종료 12:00' })).toHaveAttribute('aria-checked', 'false')
    // 미리 보기도 같은 구간 형식이다
    expect(sheet).toHaveTextContent('06:00–12:00 · 6시간')
    // 휠 항목은 터치 44 이상이다(X3)
    for (const item of within(screen.getByRole('group', { name: '시 선택' })).getAllByRole('button')) {
      expect(item.style.height).toBe('44px')
    }
    // 시트 면 위에 상자를 겹치지 않는다(H3): 휠 묶음과 시작/종료 고르기를 담던 sunken/base 상자가 없다
    expect(sheet.querySelector('.rounded-card, .bg-surface-base')).toBeNull()

    await user.click(within(segment).getByRole('radio', { name: '종료 12:00' }))
    expect(within(segment).getByRole('radio', { name: '종료 12:00' })).toHaveAttribute('aria-checked', 'true')
  })

  // 칸("시작 18:00")과 휠이 같은 24시간 표기다. 오전/오후 열은 없고, 종료만 그날의 끝 24를 고를 수 있다
  it('picks times on a 24-hour wheel: start 00–23, end 01–24, and 24 always means 24:00', async () => {
    const user = userEvent.setup()
    signInAsMember()
    useSlowSettingsServer()

    renderApp(<PomodoroSettingsPage />, { route: '/settings' })
    const eveningRow = await screen.findByRole('button', { name: /저녁/ })
    await waitFor(() => expect(eveningRow).not.toBeDisabled())
    await user.click(eveningRow)

    const sheet = await screen.findByRole('dialog', { name: '미니 데이 설정' })
    expect(within(sheet).queryByLabelText('오전 오후 선택')).not.toBeInTheDocument()
    const hourLabels = () => within(screen.getByRole('group', { name: '시 선택' })).getAllByRole('button').map((b) => b.textContent)
    expect(hourLabels()).toEqual(Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0')))
    expect(within(sheet).getByRole('radio', { name: '시작 18:00' })).toBeInTheDocument()

    await user.click(within(screen.getByRole('group', { name: '시 선택' })).getByRole('button', { name: '19' }))
    expect(within(sheet).getByRole('radio', { name: '시작 19:00' })).toBeInTheDocument()

    await user.click(within(sheet).getByRole('radio', { name: '종료 24:00' }))
    expect(hourLabels()).toEqual(Array.from({ length: 24 }, (_, h) => String(h + 1).padStart(2, '0')))
    // 24시면 분 휠에는 00 하나만 있다(돌려서 30에 멈춰도 값은 24:00인 어긋남이 없다)
    const minuteLabels = () => within(screen.getByRole('group', { name: '분 선택' })).getAllByRole('button').map((b) => b.textContent)
    expect(minuteLabels()).toEqual(['00'])
    expect(within(sheet).getByRole('radio', { name: '종료 24:00' })).toBeInTheDocument()
    await user.click(within(screen.getByRole('group', { name: '시 선택' })).getByRole('button', { name: '23' }))
    expect(within(sheet).getByRole('radio', { name: '종료 23:00' })).toBeInTheDocument()
    expect(minuteLabels()).toHaveLength(12)
    await user.click(within(screen.getByRole('group', { name: '분 선택' })).getByRole('button', { name: '30' }))
    expect(within(sheet).getByRole('radio', { name: '종료 23:30' })).toBeInTheDocument()
  })

  it('tells once that setting changes apply to newly started timers', async () => {
    signInAsMember()
    useSlowSettingsServer()

    renderApp(<PomodoroSettingsPage />, { route: '/settings' })

    expect(await screen.findAllByText(/새로 시작하는 타이머부터 적용돼요/)).toHaveLength(1)
    expect(screen.queryByText(/진행 중인 타이머는 다음 시작부터/)).not.toBeInTheDocument()
  })

  it('shows the session rows in plain words', async () => {
    signInAsMember()
    useSlowSettingsServer()

    renderApp(<PomodoroSettingsPage />, { route: '/settings' })

    expect(await screen.findByRole('button', { name: /휴식 시간.*짧은 5분, 긴 15분/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /긴 휴식까지.*4회/ })).toBeInTheDocument()
    expect(screen.getByText(/겹치면 위 구간이 우선이에요/)).toBeInTheDocument()
  })

  it('asks to reset mini days with the same time notation as the screen', async () => {
    const user = userEvent.setup()
    signInAsMember()
    const { serverState } = useSlowSettingsServer()
    serverState.miniDays = {
      ...defaultMiniDaysSettings,
      day1: { label: '아침', start: '07:00', end: '12:00' },
    }
    const nativeConfirm = vi.spyOn(window, 'confirm')

    renderApp(<PomodoroSettingsPage />, { route: '/settings' })
    await screen.findByRole('button', { name: /아침/ })
    const resetButtons = screen.getAllByRole('button', { name: '기본값 복원' })
    await user.click(resetButtons[resetButtons.length - 1])

    const sheet = screen.getByRole('dialog', { name: '미니 데이를 기본값으로 복원할까요?' })
    expect(sheet).toHaveTextContent('06:00, 12:00, 18:00')
    expect(within(sheet).getByRole('button', { name: '기본값으로 복원' })).toBeInTheDocument()
    await user.click(within(sheet).getByRole('button', { name: '돌아가기' }))
    expect(serverState.miniDays.day1.start).toBe('07:00')
    expect(nativeConfirm).not.toHaveBeenCalled()
  })

  it('asks with a confirm sheet before logging out and logs out only on the logout action', async () => {
    const user = userEvent.setup()
    signInAsMember()
    useSlowSettingsServer()
    const logout = vi.fn().mockResolvedValue(undefined)
    useAuthStore.setState({ logout })

    renderApp(<PomodoroSettingsPage />, { route: '/settings' })
    await user.click(await screen.findByRole('button', { name: '로그아웃' }))

    const sheet = screen.getByRole('dialog', { name: '로그아웃할까요?' })
    await user.click(within(sheet).getByRole('button', { name: '돌아가기' }))
    expect(logout).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '로그아웃' }))
    await user.click(
      within(screen.getByRole('dialog', { name: '로그아웃할까요?' })).getByRole('button', { name: '로그아웃' }),
    )
    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1))
  })

  it('lets the user pick system, light or dark theme in one row', async () => {
    const user = userEvent.setup()
    signInAsMember()
    useSlowSettingsServer()
    useThemeStore.getState().setTheme('system')

    renderApp(<PomodoroSettingsPage />, { route: '/settings' })

    expect(await screen.findByRole('radiogroup', { name: '화면 테마' })).toBeInTheDocument()
    expect(screen.getByText('테마')).toBeInTheDocument()
    // 다른 묶음처럼 테마 행도 카드에 담는다(사용자 결정 2026-10-20)
    expect(screen.getByRole('radiogroup', { name: '화면 테마' }).closest('.rounded-card')).toHaveClass('bg-surface-card')
    expect(screen.getByRole('radio', { name: '시스템', checked: true })).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: '다크' }))
    expect(useThemeStore.getState().theme).toBe('dark')
    expect(document.documentElement).toHaveClass('dark')
    expect(screen.getByRole('radio', { name: '다크', checked: true })).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: '시스템' }))
    expect(useThemeStore.getState().theme).toBe('system')
    expect(document.documentElement).not.toHaveClass('dark')
  })
})
