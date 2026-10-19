import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocked = vi.hoisted(() => ({
  pushState: vi.fn(),
  getActiveStates: vi.fn(),
}))

vi.mock('../../api/timerApi', () => ({
  timerApi: {
    pushState: mocked.pushState,
    getActiveStates: mocked.getActiveStates,
  },
}))

vi.mock('../../lib/sound', () => ({
  playNotificationSound: vi.fn(),
}))

type Listener = (event: MessageEvent) => void

class FakeEventSource {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSED = 2
  static instances: FakeEventSource[] = []

  readonly url: string
  readyState = FakeEventSource.CONNECTING
  onerror: (() => void) | null = null
  private listeners = new Map<string, Listener[]>()

  constructor(url: string) {
    this.url = url
    FakeEventSource.instances.push(this)
  }

  addEventListener(name: string, listener: Listener) {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), listener])
  }

  close() {
    this.readyState = FakeEventSource.CLOSED
  }

  emit(name: string, data = 'ok') {
    if (name === 'connected') this.readyState = FakeEventSource.OPEN
    this.listeners.get(name)?.forEach((listener) => listener({ data } as MessageEvent))
  }

  // 서버가 502/401처럼 SSE가 아닌 응답을 주면 브라우저는 CLOSED로 두고 다시 연결하지 않는다
  failClosed() {
    this.readyState = FakeEventSource.CLOSED
    this.onerror?.()
  }

  get token() {
    return new URL(this.url, 'http://localhost').searchParams.get('token')
  }
}

function makeJwt(expMs: number) {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${encode({ alg: 'HS256' })}.${encode({ exp: Math.floor(expMs / 1000) })}.sig`
}

const NOW = new Date('2026-10-19T09:00:00.000Z').getTime()

async function loadModules() {
  const { useAuthStore } = await import('../../store/authStore')
  const { useTimerStore } = await import('./timerStore')
  const { useSseStatusStore } = await import('./sseStatusStore')
  const { useSseTimerSync } = await import('./useSseTimerSync')
  const { initialSingleTimerState, DEFAULT_POMODORO_SETTINGS } = await import('./timerDefaults')
  return { useAuthStore, useTimerStore, useSseStatusStore, useSseTimerSync, initialSingleTimerState, DEFAULT_POMODORO_SETTINGS }
}

type Modules = Awaited<ReturnType<typeof loadModules>>

function setMember(m: Modules, userId: string, token: string) {
  act(() => {
    m.useAuthStore.setState({
      state: {
        type: 'member',
        accessToken: token,
        user: { id: userId, email: null, nickname: 'tester' },
      },
      initialized: true,
    } as never)
  })
}

describe('useSseTimerSync', () => {
  let m: Modules

  beforeEach(async () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    vi.spyOn(Math, 'random').mockReturnValue(0)
    vi.resetModules()
    FakeEventSource.instances = []
    vi.stubGlobal('EventSource', FakeEventSource)
    mocked.pushState.mockReset()
    mocked.getActiveStates.mockReset()
    mocked.getActiveStates.mockResolvedValue([])
    m = await loadModules()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  describe('연결 복구', () => {
    it('서버가 연결을 닫아 CLOSED가 되면 잠시 뒤 다시 연결한다', async () => {
      setMember(m, 'user-1', makeJwt(NOW + 15 * 60_000))
      renderHook(() => m.useSseTimerSync())
      expect(FakeEventSource.instances).toHaveLength(1)
      FakeEventSource.instances[0].emit('connected')

      act(() => FakeEventSource.instances[0].failClosed())
      expect(m.useSseStatusStore.getState().status).toBe('connecting')

      await act(() => vi.advanceTimersByTimeAsync(1_500))
      expect(FakeEventSource.instances).toHaveLength(2)

      act(() => FakeEventSource.instances[1].emit('connected'))
      expect(m.useSseStatusStore.getState().status).toBe('connected')
    })

    it('계속 실패하면 재연결 간격을 늘린다', async () => {
      setMember(m, 'user-1', makeJwt(NOW + 15 * 60_000))
      renderHook(() => m.useSseTimerSync())

      act(() => FakeEventSource.instances[0].failClosed())
      await act(() => vi.advanceTimersByTimeAsync(1_000))
      expect(FakeEventSource.instances).toHaveLength(2)

      act(() => FakeEventSource.instances[1].failClosed())
      await act(() => vi.advanceTimersByTimeAsync(1_000))
      expect(FakeEventSource.instances).toHaveLength(2)
      await act(() => vi.advanceTimersByTimeAsync(1_000))
      expect(FakeEventSource.instances).toHaveLength(3)
    })

    it('토큰이 만료돼 닫혔으면 토큰을 갱신한 뒤 새 토큰으로 다시 연결한다', async () => {
      const expired = makeJwt(NOW - 1_000)
      const fresh = makeJwt(NOW + 15 * 60_000)
      setMember(m, 'user-1', expired)
      const refresh = vi.fn(async () => {
        setMember(m, 'user-1', fresh)
      })
      m.useAuthStore.setState({ refresh })

      renderHook(() => m.useSseTimerSync())
      act(() => FakeEventSource.instances[0].failClosed())
      await act(() => vi.advanceTimersByTimeAsync(1_500))

      expect(refresh).toHaveBeenCalledTimes(1)
      expect(FakeEventSource.instances).toHaveLength(2)
      expect(FakeEventSource.instances[1].token).toBe(fresh)
    })

    it('60초 넘게 heartbeat가 없으면 연결을 새로 연다', async () => {
      setMember(m, 'user-1', makeJwt(NOW + 30 * 60_000))
      renderHook(() => m.useSseTimerSync())
      act(() => FakeEventSource.instances[0].emit('connected'))

      // heartbeat가 오는 동안은 유지한다
      await act(() => vi.advanceTimersByTimeAsync(25_000))
      act(() => FakeEventSource.instances[0].emit('heartbeat'))
      await act(() => vi.advanceTimersByTimeAsync(50_000))
      expect(FakeEventSource.instances).toHaveLength(1)

      await act(() => vi.advanceTimersByTimeAsync(30_000))
      expect(FakeEventSource.instances).toHaveLength(2)
      expect(FakeEventSource.instances[0].readyState).toBe(FakeEventSource.CLOSED)
    })

    it('화면으로 돌아왔을 때 연결이 닫혀 있으면 바로 다시 연결한다', async () => {
      setMember(m, 'user-1', makeJwt(NOW + 15 * 60_000))
      renderHook(() => m.useSseTimerSync())
      act(() => FakeEventSource.instances[0].emit('connected'))
      // 백그라운드에서 끊긴 채 남아 있는 상황
      FakeEventSource.instances[0].readyState = FakeEventSource.CLOSED

      vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'))
      })

      expect(FakeEventSource.instances).toHaveLength(2)
    })

    it('다시 연결되면 서버 타이머 상태를 한 번 다시 받아온다', async () => {
      const { initialSingleTimerState, DEFAULT_POMODORO_SETTINGS } = m
      mocked.getActiveStates.mockResolvedValue([
        {
          todoId: 'todo-1',
          version: 7,
          state: {
            ...initialSingleTimerState,
            mode: 'pomodoro',
            status: 'paused',
            remainingMs: 10 * 60_000,
            settingsSnapshot: DEFAULT_POMODORO_SETTINGS,
          },
        },
      ])
      setMember(m, 'user-1', makeJwt(NOW + 15 * 60_000))
      renderHook(() => m.useSseTimerSync())

      act(() => FakeEventSource.instances[0].emit('connected'))
      expect(mocked.getActiveStates).not.toHaveBeenCalled()

      act(() => FakeEventSource.instances[0].failClosed())
      await act(() => vi.advanceTimersByTimeAsync(1_500))
      await act(async () => {
        FakeEventSource.instances[1].emit('connected')
      })

      expect(mocked.getActiveStates).toHaveBeenCalledTimes(1)
      expect(m.useTimerStore.getState().timers['todo-1']?.status).toBe('paused')
    })

    it('재조회는 아직 서버에 못 보낸 로컬 변경을 덮어쓰지 않는다', async () => {
      const { initialSingleTimerState, DEFAULT_POMODORO_SETTINGS } = m
      mocked.pushState.mockRejectedValue({ status: 503, message: 'down' })
      // 서버에는 끊기기 전 running 상태가 남아 있다
      mocked.getActiveStates.mockResolvedValue([
        {
          todoId: 'todo-1',
          version: 6,
          state: {
            ...initialSingleTimerState,
            mode: 'pomodoro',
            status: 'running',
            endAt: NOW + 20 * 60_000,
            settingsSnapshot: DEFAULT_POMODORO_SETTINGS,
          },
        },
      ])
      setMember(m, 'user-1', makeJwt(NOW + 30 * 60_000))
      renderHook(() => m.useSseTimerSync())
      act(() => FakeEventSource.instances[0].emit('connected'))

      // 오프라인에서 일시정지 → push 3번 실패로 재전송 대기
      act(() => {
        m.useTimerStore.setState({
          timers: {
            'todo-1': {
              ...initialSingleTimerState,
              mode: 'pomodoro',
              status: 'paused',
              remainingMs: 20 * 60_000,
              settingsSnapshot: DEFAULT_POMODORO_SETTINGS,
            },
          },
        })
      })
      await act(() => vi.advanceTimersByTimeAsync(3_100))
      expect(mocked.pushState).toHaveBeenCalledTimes(3)

      act(() => FakeEventSource.instances[0].failClosed())
      await act(() => vi.advanceTimersByTimeAsync(1_500))
      await act(async () => {
        FakeEventSource.instances[1].emit('connected')
      })

      expect(mocked.getActiveStates).toHaveBeenCalledTimes(1)
      expect(m.useTimerStore.getState().timers['todo-1']?.status).toBe('paused')
    })

    it('토큰 갱신을 기다리는 동안 화면 복귀가 와도 연결을 하나만 연다', async () => {
      const fresh = makeJwt(NOW + 15 * 60_000)
      setMember(m, 'user-1', makeJwt(NOW - 1_000))
      let finishRefresh: () => void = () => {}
      const refresh = vi.fn(() => new Promise<void>((resolve) => {
        finishRefresh = () => {
          setMember(m, 'user-1', fresh)
          resolve()
        }
      }))
      m.useAuthStore.setState({ refresh })

      renderHook(() => m.useSseTimerSync())
      act(() => FakeEventSource.instances[0].failClosed())
      await act(() => vi.advanceTimersByTimeAsync(1_500))
      expect(refresh).toHaveBeenCalledTimes(1)

      vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'))
      })
      await act(() => vi.advanceTimersByTimeAsync(15_000))
      expect(FakeEventSource.instances).toHaveLength(1)

      await act(async () => {
        finishRefresh()
      })
      expect(FakeEventSource.instances).toHaveLength(2)
      expect(FakeEventSource.instances[1].token).toBe(fresh)
    })
  })

  describe('인증 변경', () => {
    it('같은 사용자의 토큰만 바뀌면 연결을 끊지 않는다', () => {
      setMember(m, 'user-1', makeJwt(NOW + 15 * 60_000))
      renderHook(() => m.useSseTimerSync())
      expect(FakeEventSource.instances).toHaveLength(1)

      setMember(m, 'user-1', makeJwt(NOW + 30 * 60_000))

      expect(FakeEventSource.instances).toHaveLength(1)
      expect(FakeEventSource.instances[0].readyState).not.toBe(FakeEventSource.CLOSED)
    })

    it('사용자가 바뀌면 새 토큰으로 다시 연결한다', () => {
      setMember(m, 'user-1', makeJwt(NOW + 15 * 60_000))
      renderHook(() => m.useSseTimerSync())

      const otherToken = makeJwt(NOW + 20 * 60_000)
      setMember(m, 'user-2', otherToken)

      expect(FakeEventSource.instances).toHaveLength(2)
      expect(FakeEventSource.instances[0].readyState).toBe(FakeEventSource.CLOSED)
      expect(FakeEventSource.instances[1].token).toBe(otherToken)
    })

    it('로그아웃하면 연결을 닫는다', () => {
      setMember(m, 'user-1', makeJwt(NOW + 15 * 60_000))
      renderHook(() => m.useSseTimerSync())

      act(() => {
        m.useAuthStore.setState({ state: null })
      })

      expect(FakeEventSource.instances[0].readyState).toBe(FakeEventSource.CLOSED)
      expect(m.useSseStatusStore.getState().status).toBe('disconnected')
    })
  })

  describe('상태 push 재전송', () => {
    function startTimer() {
      act(() => {
        m.useTimerStore.setState({
          timers: {
            'todo-1': {
              ...m.initialSingleTimerState,
              mode: 'pomodoro',
              status: 'running',
              endAt: Date.now() + 25 * 60_000,
              settingsSnapshot: m.DEFAULT_POMODORO_SETTINGS,
            },
          },
        })
      })
    }

    it('3번 실패한 push는 탭이 보이는 동안에도 주기적으로 다시 보낸다', async () => {
      mocked.pushState
        .mockRejectedValueOnce({ status: 503, message: 'down' })
        .mockRejectedValueOnce({ status: 503, message: 'down' })
        .mockRejectedValueOnce({ status: 503, message: 'down' })
        .mockResolvedValue({ todoId: 'todo-1', state: null, version: 1 })
      setMember(m, 'user-1', makeJwt(NOW + 30 * 60_000))
      renderHook(() => m.useSseTimerSync())

      startTimer()
      await act(() => vi.advanceTimersByTimeAsync(3_100))
      expect(mocked.pushState).toHaveBeenCalledTimes(3)

      await act(() => vi.advanceTimersByTimeAsync(10_000))
      expect(mocked.pushState).toHaveBeenCalledTimes(4)

      // 성공한 뒤에는 더 보내지 않는다
      await act(() => vi.advanceTimersByTimeAsync(30_000))
      expect(mocked.pushState).toHaveBeenCalledTimes(4)
    })

    it('Todo가 삭제돼 404가 나면 재시도하지 않고 큐에서 뺀다', async () => {
      mocked.pushState.mockRejectedValue({ status: 404, message: 'not found' })
      setMember(m, 'user-1', makeJwt(NOW + 30 * 60_000))
      renderHook(() => m.useSseTimerSync())

      startTimer()
      await act(() => vi.advanceTimersByTimeAsync(60_000))

      vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'))
      })
      await act(() => vi.advanceTimersByTimeAsync(5_000))

      expect(mocked.pushState).toHaveBeenCalledTimes(1)
    })
  })
})
