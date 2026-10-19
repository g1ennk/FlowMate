import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_POMODORO_SETTINGS, initialSingleTimerState } from './timerDefaults'
import { useTimerStore } from './timerStore'
import { usePomodoroAutoSessionSync } from './usePomodoroAutoSessionSync'
import { useStopwatchSessionSync } from './useStopwatchSessionSync'

const mocked = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
}))

vi.mock('../todos/hooks', () => ({
  useCreateSession: () => ({ mutateAsync: mocked.mutateAsync }),
}))

vi.mock('../../lib/sound', () => ({
  playNotificationSound: vi.fn(),
}))

const TODO_ID = 'todo-1'
const SID_A = '11111111-1111-4111-8111-111111111111'
const SID_B = '22222222-2222-4222-8222-222222222222'

async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

function sentSessionIds() {
  return mocked.mutateAsync.mock.calls.map(([vars]) => vars.body.clientSessionId as string)
}

describe('세션 큐의 영구 오류 처리', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-19T09:00:00.000Z'))
    vi.spyOn(Math, 'random').mockReturnValue(0)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocked.mutateAsync.mockReset()
    useTimerStore.getState().clearAll()
  })

  afterEach(() => {
    useTimerStore.getState().clearAll()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('뽀모도로 자동 세션', () => {
    function queueTwoSessions() {
      useTimerStore.setState({
        pendingAutoSessions: {
          [TODO_ID]: [
            { sessionFocusSeconds: 1500, breakSeconds: 0, clientSessionId: SID_A },
            { sessionFocusSeconds: 1500, breakSeconds: 0, clientSessionId: SID_B },
          ],
        },
      })
    }

    async function runSync() {
      const { result } = renderHook(() => usePomodoroAutoSessionSync())
      act(() => result.current(useTimerStore.getState()))
      await flush()
      await flush()
      return result
    }

    it.each([
      ['400', { status: 400, message: 'invalid' }],
      ['404', { status: 404, message: 'not found' }],
      ['409 멱등 충돌', { status: 409, code: 'IDEMPOTENCY_CONFLICT', message: 'mismatch' }],
    ])('%s 응답은 버리고 같은 Todo의 다음 세션을 보낸다', async (_, error) => {
      mocked.mutateAsync.mockRejectedValueOnce(error).mockResolvedValue(undefined)
      queueTwoSessions()

      await runSync()

      expect(sentSessionIds()).toEqual([SID_A, SID_B])
      expect(useTimerStore.getState().pendingAutoSessions[TODO_ID]).toBeUndefined()
    })

    it.each([
      ['5xx', { status: 503, message: 'unavailable' }],
      ['네트워크 오류', new TypeError('Failed to fetch')],
      ['409 일시 충돌', { status: 409, code: 'CONFLICT', message: 'deadlock' }],
    ])('%s이면 큐에 남겨 다시 보낸다', async (_, error) => {
      mocked.mutateAsync.mockRejectedValueOnce(error).mockResolvedValue(undefined)
      queueTwoSessions()

      const result = await runSync()

      expect(sentSessionIds()).toEqual([SID_A])
      expect(useTimerStore.getState().pendingAutoSessions[TODO_ID]).toHaveLength(2)

      await act(() => vi.advanceTimersByTimeAsync(1_500))
      act(() => result.current(useTimerStore.getState()))
      await flush()
      await flush()

      expect(sentSessionIds()).toEqual([SID_A, SID_A, SID_B])
    })
  })

  describe('일반 타이머 세션', () => {
    function setStopwatchWithTwoSessions() {
      useTimerStore.setState({
        timers: {
          [TODO_ID]: {
            ...initialSingleTimerState,
            mode: 'stopwatch',
            status: 'paused',
            flexiblePhase: 'focus',
            settingsSnapshot: DEFAULT_POMODORO_SETTINGS,
            sessions: [
              { sessionFocusSeconds: 1200, breakSeconds: 300, clientSessionId: SID_A },
              { sessionFocusSeconds: 900, breakSeconds: 0, clientSessionId: SID_B },
            ],
          },
        },
      })
    }

    async function runSync() {
      const { result } = renderHook(() => useStopwatchSessionSync())
      act(() => result.current(useTimerStore.getState()))
      await flush()
      await flush()
      return result
    }

    it('400은 버리고 뒤 세션을 보낸 뒤 다시 보내지 않는다', async () => {
      mocked.mutateAsync.mockRejectedValueOnce({ status: 400, message: 'invalid' }).mockResolvedValue(undefined)
      setStopwatchWithTwoSessions()

      const result = await runSync()
      expect(sentSessionIds()).toEqual([SID_A, SID_B])
      expect(console.error).toHaveBeenCalled()

      await act(() => vi.advanceTimersByTimeAsync(60_000))
      act(() => result.current(useTimerStore.getState()))
      await flush()

      expect(sentSessionIds()).toEqual([SID_A, SID_B])
    })

    it('5xx는 같은 세션부터 다시 보낸다', async () => {
      mocked.mutateAsync.mockRejectedValueOnce({ status: 500, message: 'error' }).mockResolvedValue(undefined)
      setStopwatchWithTwoSessions()

      const result = await runSync()
      expect(sentSessionIds()).toEqual([SID_A])

      await act(() => vi.advanceTimersByTimeAsync(1_500))
      act(() => result.current(useTimerStore.getState()))
      await flush()
      await flush()

      expect(sentSessionIds()).toEqual([SID_A, SID_A, SID_B])
    })
  })
})
