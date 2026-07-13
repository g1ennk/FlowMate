import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { timerApi } from '../../api/timerApi'
import { useAuthStore } from '../../store/authStore'
import type { SingleTimerState } from './timerTypes'
import { useTimerStore } from './timerStore'
import { useSseTimerSync } from './useSseTimerSync'

vi.mock('../../lib/sound', () => ({
  playNotificationSound: vi.fn(),
}))

const TODO_ID = 'todo-1'
const EXISTING_SESSION_ID = '11111111-1111-4111-8111-111111111111'

const settings = {
  flowMin: 10,
  breakMin: 1,
  longBreakMin: 5,
  cycleEvery: 4,
  autoStartBreak: true,
  autoStartSession: false,
}

function createPomodoroTimer(overrides: Partial<SingleTimerState>): SingleTimerState {
  return {
    mode: 'pomodoro',
    settingsSnapshot: settings,
    phase: 'short',
    status: 'running',
    endAt: null,
    remainingMs: null,
    elapsedMs: 0,
    initialFocusMs: 0,
    startedAt: null,
    cycleCount: 1,
    flexiblePhase: null,
    focusElapsedMs: 0,
    breakElapsedMs: 0,
    breakTargetMs: null,
    breakCompleted: false,
    focusStartedAt: null,
    breakStartedAt: null,
    breakSessionPendingUpdate: false,
    sessions: [
      {
        sessionFocusSeconds: 600,
        breakSeconds: 0,
        clientSessionId: EXISTING_SESSION_ID,
      },
    ],
    ...overrides,
  }
}

function setTimer(timer: SingleTimerState) {
  useTimerStore.setState({
    timers: { [TODO_ID]: timer },
    pendingAutoSessions: {},
  })
}

describe('useTimerStore pomodoro elapsed boundary handling', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-06T09:00:00.000Z'))
    useTimerStore.getState().clearAll()
  })

  afterEach(() => {
    useTimerStore.getState().clearAll()
    vi.useRealTimers()
  })

  it('records a 60 second break when the countdown auto-completes', () => {
    setTimer(
      createPomodoroTimer({
        phase: 'short',
        endAt: Date.now() - 1,
        remainingMs: 80,
      }),
    )

    useTimerStore.getState().tick()

    const timer = useTimerStore.getState().timers[TODO_ID]
    expect(timer.phase).toBe('flow')
    expect(timer.status).toBe('waiting')
    expect(timer.sessions[0]).toMatchObject({
      sessionFocusSeconds: 600,
      breakSeconds: 60,
      clientSessionId: EXISTING_SESSION_ID,
    })
    expect(useTimerStore.getState().pendingAutoSessions[TODO_ID]).toEqual([
      {
        sessionFocusSeconds: 600,
        breakSeconds: 60,
        clientSessionId: EXISTING_SESSION_ID,
      },
    ])
  })

  it('derives the same next focus id when independent runtimes finish the same break', () => {
    const sharedTimer = createPomodoroTimer({
      sessionSequenceSeed: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      sessionSequence: 0,
      activeSessionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      phase: 'short',
      endAt: Date.now(),
      remainingMs: 0,
    })

    setTimer(sharedTimer)
    useTimerStore.getState().skipToNext(TODO_ID)
    const firstId = useTimerStore.getState().timers[TODO_ID].activeSessionId

    setTimer({ ...sharedTimer, sessions: [...sharedTimer.sessions] })
    useTimerStore.getState().skipToNext(TODO_ID)
    const secondId = useTimerStore.getState().timers[TODO_ID].activeSessionId

    expect(firstId).toBe(secondId)
    expect(firstId).not.toBe(sharedTimer.activeSessionId)
  })

  it('upserts an appended session into the pending queue by clientSessionId', () => {
    const session = {
      sessionFocusSeconds: 600,
      breakSeconds: 60,
      clientSessionId: EXISTING_SESSION_ID,
    }
    setTimer(createPomodoroTimer({ phase: 'flow', sessions: [] }))
    useTimerStore.setState({
      pendingAutoSessions: {
        [TODO_ID]: [{ ...session, breakSeconds: 0 }],
      },
    })

    useTimerStore.getState().updateSessions(TODO_ID, [session])

    expect(useTimerStore.getState().pendingAutoSessions[TODO_ID]).toEqual([session])
  })

  it('does not record a 59 second break when returning to flow manually', () => {
    setTimer(
      createPomodoroTimer({
        phase: 'short',
        endAt: Date.now() + 1_000,
        remainingMs: 0,
      }),
    )

    useTimerStore.getState().skipToNext(TODO_ID)

    const timer = useTimerStore.getState().timers[TODO_ID]
    expect(timer.phase).toBe('flow')
    expect(timer.sessions[0]).toMatchObject({
      sessionFocusSeconds: 600,
      breakSeconds: 0,
      clientSessionId: EXISTING_SESSION_ID,
    })
    expect(useTimerStore.getState().pendingAutoSessions[TODO_ID]).toBeUndefined()
  })

  it('records a 60 second break when returning to flow manually at the boundary', () => {
    setTimer(
      createPomodoroTimer({
        phase: 'short',
        endAt: Date.now(),
        remainingMs: 75,
      }),
    )

    useTimerStore.getState().skipToNext(TODO_ID)

    const timer = useTimerStore.getState().timers[TODO_ID]
    expect(timer.phase).toBe('flow')
    expect(timer.sessions[0]).toMatchObject({
      sessionFocusSeconds: 600,
      breakSeconds: 60,
      clientSessionId: EXISTING_SESSION_ID,
    })
    expect(useTimerStore.getState().pendingAutoSessions[TODO_ID]).toEqual([
      {
        sessionFocusSeconds: 600,
        breakSeconds: 60,
        clientSessionId: EXISTING_SESSION_ID,
      },
    ])
  })

  it('records a 61 second break when returning to flow manually after the boundary', () => {
    setTimer(
      createPomodoroTimer({
        phase: 'short',
        endAt: Date.now() - 1_000,
        remainingMs: 75,
      }),
    )

    useTimerStore.getState().skipToNext(TODO_ID)

    const timer = useTimerStore.getState().timers[TODO_ID]
    expect(timer.phase).toBe('flow')
    expect(timer.sessions[0]).toMatchObject({
      sessionFocusSeconds: 600,
      breakSeconds: 61,
      clientSessionId: EXISTING_SESSION_ID,
    })
    expect(useTimerStore.getState().pendingAutoSessions[TODO_ID]).toEqual([
      {
        sessionFocusSeconds: 600,
        breakSeconds: 61,
        clientSessionId: EXISTING_SESSION_ID,
      },
    ])
  })

  it('records a 60 second flow when moving to break manually with stale remaining time', () => {
    setTimer(
      createPomodoroTimer({
        phase: 'flow',
        endAt: Date.now() + 540_000,
        remainingMs: 600_000,
        cycleCount: 0,
        sessions: [],
      }),
    )

    useTimerStore.getState().skipToNext(TODO_ID)

    const timer = useTimerStore.getState().timers[TODO_ID]
    expect(timer.phase).toBe('short')
    expect(timer.status).toBe('running')
    expect(timer.sessions).toHaveLength(1)
    expect(timer.sessions[0]).toMatchObject({
      sessionFocusSeconds: 60,
      breakSeconds: 0,
    })
    expect(timer.sessions[0].clientSessionId).toEqual(expect.any(String))
    expect(useTimerStore.getState().pendingAutoSessions[TODO_ID]).toHaveLength(1)
    expect(useTimerStore.getState().pendingAutoSessions[TODO_ID]?.[0]).toMatchObject({
      sessionFocusSeconds: 60,
      breakSeconds: 0,
      clientSessionId: timer.sessions[0].clientSessionId,
    })
  })
})

describe('useTimerStore applyRemoteState / applyRemoteReset', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-06T09:00:00.000Z'))
    useTimerStore.getState().clearAll()
  })

  afterEach(() => {
    useTimerStore.getState().clearAll()
    vi.useRealTimers()
  })

  const remoteTimer: SingleTimerState = {
    mode: 'pomodoro',
    phase: 'flow',
    status: 'running',
    endAt: Date.now() + 600_000,
    remainingMs: 600_000,
    elapsedMs: 0,
    initialFocusMs: 0,
    startedAt: Date.now(),
    cycleCount: 1,
    settingsSnapshot: null,
    flexiblePhase: null,
    focusElapsedMs: 0,
    breakElapsedMs: 0,
    breakTargetMs: null,
    breakCompleted: false,
    focusStartedAt: null,
    breakStartedAt: null,
    breakSessionPendingUpdate: false,
    sessions: [],
  }

  it('applyRemoteState with version > last applies the state', () => {
    useTimerStore.getState().applyRemoteState(TODO_ID, remoteTimer, 100)

    expect(useTimerStore.getState().timers[TODO_ID]).toBeDefined()
    expect(useTimerStore.getState().timers[TODO_ID].status).toBe('running')
  })

  it('applyRemoteState with same version drops the state', () => {
    useTimerStore.getState().applyRemoteState(TODO_ID, remoteTimer, 100)

    const updated: SingleTimerState = { ...remoteTimer, status: 'paused', endAt: null }
    useTimerStore.getState().applyRemoteState(TODO_ID, updated, 100)

    expect(useTimerStore.getState().timers[TODO_ID].status).toBe('running')
  })

  it('applyRemoteState with version < last is dropped', () => {
    useTimerStore.getState().applyRemoteState(TODO_ID, remoteTimer, 200)

    const stale: SingleTimerState = { ...remoteTimer, status: 'paused', endAt: null }
    useTimerStore.getState().applyRemoteState(TODO_ID, stale, 100)

    expect(useTimerStore.getState().timers[TODO_ID].status).toBe('running')
  })

  it('applyRemoteReset with version > last removes the timer', () => {
    useTimerStore.getState().applyRemoteState(TODO_ID, remoteTimer, 100)
    expect(useTimerStore.getState().timers[TODO_ID]).toBeDefined()

    useTimerStore.getState().applyRemoteReset(TODO_ID, 200)
    expect(useTimerStore.getState().timers[TODO_ID]).toBeUndefined()
  })

  it('applyRemoteReset with same version drops the reset', () => {
    useTimerStore.getState().applyRemoteState(TODO_ID, remoteTimer, 100)
    expect(useTimerStore.getState().timers[TODO_ID]).toBeDefined()

    useTimerStore.getState().applyRemoteReset(TODO_ID, 100)
    expect(useTimerStore.getState().timers[TODO_ID]).toBeDefined()
  })

  it('applyRemoteState with the same version as a reset stays removed', () => {
    useTimerStore.getState().applyRemoteState(TODO_ID, remoteTimer, 100)
    useTimerStore.getState().applyRemoteReset(TODO_ID, 200)
    expect(useTimerStore.getState().timers[TODO_ID]).toBeUndefined()

    useTimerStore.getState().applyRemoteState(TODO_ID, remoteTimer, 200)

    expect(useTimerStore.getState().timers[TODO_ID]).toBeUndefined()
  })

  it('recordPushedVersion seeds the watermark without lowering a newer version', () => {
    const { recordPushedVersion } = useTimerStore.getState()
    expect(recordPushedVersion).toBeTypeOf('function')

    useTimerStore.setState({ timers: { [TODO_ID]: remoteTimer } })
    recordPushedVersion(TODO_ID, 300)

    const sameVersionEcho: SingleTimerState = {
      ...remoteTimer,
      status: 'paused',
      endAt: null,
    }
    useTimerStore.getState().applyRemoteState(TODO_ID, sameVersionEcho, 300)
    useTimerStore.getState().applyRemoteReset(TODO_ID, 299)

    expect(useTimerStore.getState().timers[TODO_ID].status).toBe('running')

    useTimerStore.getState().applyRemoteState(TODO_ID, sameVersionEcho, 400)
    recordPushedVersion(TODO_ID, 350)
    useTimerStore.getState().applyRemoteReset(TODO_ID, 400)

    expect(useTimerStore.getState().timers[TODO_ID].status).toBe('paused')
  })

  // 2026-05-20 prod 회귀: reset → initPomodoro/initStopwatch 시퀀스 직후 자기 자신이
  // 보낸 SSE delete echo 가 도달했을 때, 방금 초기화한 idle timer 까지 삭제되어
  // 재게/시작 버튼이 무반응이 되는 race. local idle 은 사용자 UI 상태이므로 보존해야 한다.
  it('applyRemoteReset preserves local idle pomodoro timer (self-echo after reset+init)', () => {
    useTimerStore.getState().initPomodoro(TODO_ID, settings)
    expect(useTimerStore.getState().timers[TODO_ID]?.status).toBe('idle')

    useTimerStore.getState().applyRemoteReset(TODO_ID, 200)

    const timer = useTimerStore.getState().timers[TODO_ID]
    expect(timer).toBeDefined()
    expect(timer.status).toBe('idle')
    expect(timer.mode).toBe('pomodoro')
  })

  it('applyRemoteReset preserves local idle stopwatch timer (self-echo after reset+init)', () => {
    useTimerStore.getState().initStopwatch(TODO_ID, 0, settings)
    expect(useTimerStore.getState().timers[TODO_ID]?.status).toBe('idle')

    useTimerStore.getState().applyRemoteReset(TODO_ID, 200)

    const timer = useTimerStore.getState().timers[TODO_ID]
    expect(timer).toBeDefined()
    expect(timer.status).toBe('idle')
    expect(timer.mode).toBe('stopwatch')
  })
})

describe('useTimerStore applyRemoteReset session duplication regression', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-23T00:00:00.000Z'))
    useTimerStore.getState().clearAll()
  })

  afterEach(() => {
    useTimerStore.getState().clearAll()
    vi.useRealTimers()
  })

  function setInProgressStopwatch() {
    useTimerStore.setState({
      timers: {
        [TODO_ID]: {
          mode: 'stopwatch',
          settingsSnapshot: null,
          phase: 'flow',
          status: 'running',
          endAt: null,
          remainingMs: null,
          elapsedMs: 5_391_000,
          initialFocusMs: 0,
          startedAt: null,
          cycleCount: 0,
          flexiblePhase: 'focus',
          focusElapsedMs: 5_391_000,
          breakElapsedMs: 0,
          breakTargetMs: null,
          breakCompleted: false,
          focusStartedAt: Date.now(),
          breakStartedAt: null,
          breakSessionPendingUpdate: false,
          sessions: [],
        },
      },
      pendingAutoSessions: {},
    })
  }

  function expectResetWithoutNewSession() {
    const state = useTimerStore.getState()
    expect(state.pendingAutoSessions[TODO_ID]).toBeUndefined()
    expect(state.pendingAutoSessions).toEqual({})
    expect(state.timers[TODO_ID]).toBeUndefined()
  }

  it('pause → remote reset does not create a second session', () => {
    setInProgressStopwatch()
    useTimerStore.getState().pause(TODO_ID)

    useTimerStore.getState().applyRemoteReset(TODO_ID, 100)

    expectResetWithoutNewSession()
  })

  it('remote reset → pause does not create a second session', () => {
    setInProgressStopwatch()

    useTimerStore.getState().applyRemoteReset(TODO_ID, 100)
    useTimerStore.getState().pause(TODO_ID)

    expectResetWithoutNewSession()
  })

  it('remote reset without a preceding pause does not create a second session', () => {
    setInProgressStopwatch()

    useTimerStore.getState().applyRemoteReset(TODO_ID, 100)

    expectResetWithoutNewSession()
  })

  it('duplicate remote reset does not create a second session', () => {
    setInProgressStopwatch()

    useTimerStore.getState().applyRemoteReset(TODO_ID, 100)
    useTimerStore.getState().applyRemoteReset(TODO_ID, 100)

    expectResetWithoutNewSession()
  })
})

describe('useSseTimerSync pushed version watermark', () => {
  beforeEach(() => {
    useTimerStore.getState().clearAll()
    useAuthStore.setState({
      state: {
        type: 'member',
        accessToken: 'member-token',
        user: { id: 'member-1', email: null, nickname: 'member' },
      },
      initialized: true,
    })
    vi.stubGlobal(
      'EventSource',
      class {
        onerror: (() => void) | null = null
        addEventListener() {}
        close() {}
      },
    )
  })

  afterEach(() => {
    useAuthStore.setState({ state: null, initialized: false })
    useTimerStore.getState().clearAll()
  })

  it('drops an echo matching the version returned by a successful pushState', async () => {
    const pushedTimer = createPomodoroTimer({
      phase: 'flow',
      status: 'running',
      sessions: [],
    })
    vi.spyOn(timerApi, 'pushState').mockResolvedValue({
      todoId: TODO_ID,
      state: pushedTimer,
      version: 500,
    })
    renderHook(() => useSseTimerSync())

    act(() => {
      useTimerStore.setState({ timers: { [TODO_ID]: pushedTimer } })
    })
    await waitFor(() => {
      expect(timerApi.pushState).toHaveBeenCalledWith(TODO_ID, {
        status: 'running',
        state: pushedTimer,
      })
    })

    const sameVersionEcho: SingleTimerState = {
      ...pushedTimer,
      status: 'paused',
      endAt: null,
    }
    useTimerStore.getState().applyRemoteState(TODO_ID, sameVersionEcho, 500)

    expect(useTimerStore.getState().timers[TODO_ID].status).toBe('running')
  })
})

// 2026-05-11 prod 사고 (todo 51e6bf2e): 120분 진행했는데 45분만 기록됨.
// 휴식 후 focus 75분을 휴식 없이 진행하다가 timer가 reset된 경로(modal 닫기/mode 전환 등)에서
// 누적 focus가 sessions/sync 큐 어디에도 commit되지 않고 손실되는 회귀.
describe('useTimerStore reset — stopwatch in-progress focus accumulation 보존', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-11T00:00:00.000Z'))
    useTimerStore.getState().clearAll()
  })

  afterEach(() => {
    useTimerStore.getState().clearAll()
    vi.useRealTimers()
  })

  it('휴식 없이 진행 중인 stopwatch focus가 reset 시 누적 시간을 pendingAutoSessions에 보존한다', () => {
    const FIRST_FOCUS_SID = '11111111-1111-4111-8111-111111111111'

    useTimerStore.setState({
      timers: {
        [TODO_ID]: {
          mode: 'stopwatch',
          settingsSnapshot: null,
          phase: 'flow',
          status: 'paused',
          endAt: null,
          remainingMs: null,
          elapsedMs: 120 * 60 * 1000,
          initialFocusMs: 45 * 60 * 1000,
          startedAt: null,
          cycleCount: 0,
          flexiblePhase: 'focus',
          focusElapsedMs: 120 * 60 * 1000,
          breakElapsedMs: 0,
          breakTargetMs: null,
          breakCompleted: false,
          focusStartedAt: null,
          breakStartedAt: null,
          breakSessionPendingUpdate: false,
          sessions: [
            { sessionFocusSeconds: 45 * 60, breakSeconds: 20 * 60, clientSessionId: FIRST_FOCUS_SID },
          ],
        },
      },
      pendingAutoSessions: {},
    })

    useTimerStore.getState().commitPendingFocus(TODO_ID)
    useTimerStore.getState().reset(TODO_ID)

    const state = useTimerStore.getState()
    expect(state.timers[TODO_ID]).toBeUndefined()

    const pending = state.pendingAutoSessions[TODO_ID]
    expect(pending).toBeDefined()
    expect(pending).toHaveLength(1)
    expect(pending![0]).toMatchObject({
      sessionFocusSeconds: 75 * 60,
      breakSeconds: 0,
    })
    expect(pending![0].clientSessionId).toEqual(expect.any(String))
  })

  it('commitPendingFocus는 MIN_FLOW_MS 미만의 짧은 focus는 무시한다', () => {
    useTimerStore.setState({
      timers: {
        [TODO_ID]: {
          mode: 'stopwatch',
          settingsSnapshot: null,
          phase: 'flow',
          status: 'paused',
          endAt: null,
          remainingMs: null,
          elapsedMs: 30 * 1000,
          initialFocusMs: 0,
          startedAt: null,
          cycleCount: 0,
          flexiblePhase: 'focus',
          focusElapsedMs: 30 * 1000,
          breakElapsedMs: 0,
          breakTargetMs: null,
          breakCompleted: false,
          focusStartedAt: null,
          breakStartedAt: null,
          breakSessionPendingUpdate: false,
          sessions: [],
        },
      },
      pendingAutoSessions: {},
    })

    useTimerStore.getState().commitPendingFocus(TODO_ID)

    expect(useTimerStore.getState().pendingAutoSessions[TODO_ID]).toBeUndefined()
  })

  it('clearPendingAutoSessions는 해당 todoId의 sync 큐만 제거한다', () => {
    useTimerStore.setState({
      timers: {},
      pendingAutoSessions: {
        [TODO_ID]: [
          {
            sessionFocusSeconds: 75 * 60,
            breakSeconds: 0,
            clientSessionId: '22222222-2222-4222-8222-222222222222',
          },
        ],
        'other-todo': [
          {
            sessionFocusSeconds: 10 * 60,
            breakSeconds: 0,
            clientSessionId: '33333333-3333-4333-8333-333333333333',
          },
        ],
      },
    })

    useTimerStore.getState().clearPendingAutoSessions(TODO_ID)

    const state = useTimerStore.getState()
    expect(state.pendingAutoSessions[TODO_ID]).toBeUndefined()
    expect(state.pendingAutoSessions['other-todo']).toHaveLength(1)
  })

  it('commitPendingFocus는 pomodoro flow 진행 중에도 누적 시간을 pendingAutoSessions에 보존한다', () => {
    useTimerStore.setState({
      timers: {
        [TODO_ID]: {
          mode: 'pomodoro',
          settingsSnapshot: {
            flowMin: 25,
            breakMin: 5,
            longBreakMin: 15,
            cycleEvery: 4,
            autoStartBreak: false,
            autoStartSession: false,
          },
          phase: 'flow',
          status: 'paused',
          endAt: null,
          remainingMs: 7 * 60 * 1000,
          elapsedMs: 0,
          initialFocusMs: 0,
          startedAt: null,
          cycleCount: 0,
          flexiblePhase: null,
          focusElapsedMs: 0,
          breakElapsedMs: 0,
          breakTargetMs: null,
          breakCompleted: false,
          focusStartedAt: null,
          breakStartedAt: null,
          breakSessionPendingUpdate: false,
          sessions: [],
        },
      },
      pendingAutoSessions: {},
    })

    useTimerStore.getState().commitPendingFocus(TODO_ID)

    const pending = useTimerStore.getState().pendingAutoSessions[TODO_ID]
    expect(pending).toBeDefined()
    expect(pending).toHaveLength(1)
    expect(pending![0]).toMatchObject({
      sessionFocusSeconds: 18 * 60,
      breakSeconds: 0,
    })
  })

  it('commitPendingFocus는 pomodoro break phase 에서는 아무 것도 추가하지 않는다', () => {
    useTimerStore.setState({
      timers: {
        [TODO_ID]: {
          mode: 'pomodoro',
          settingsSnapshot: {
            flowMin: 25,
            breakMin: 5,
            longBreakMin: 15,
            cycleEvery: 4,
            autoStartBreak: false,
            autoStartSession: false,
          },
          phase: 'short',
          status: 'paused',
          endAt: null,
          remainingMs: 3 * 60 * 1000,
          elapsedMs: 0,
          initialFocusMs: 0,
          startedAt: null,
          cycleCount: 1,
          flexiblePhase: null,
          focusElapsedMs: 0,
          breakElapsedMs: 0,
          breakTargetMs: null,
          breakCompleted: false,
          focusStartedAt: null,
          breakStartedAt: null,
          breakSessionPendingUpdate: false,
          sessions: [],
        },
      },
      pendingAutoSessions: {},
    })

    useTimerStore.getState().commitPendingFocus(TODO_ID)

    expect(useTimerStore.getState().pendingAutoSessions[TODO_ID]).toBeUndefined()
  })

  it('commitPendingFocus는 pomodoro flow 가 거의 다 끝났으면 skip — completePhase 가 처리할 영역', () => {
    useTimerStore.setState({
      timers: {
        [TODO_ID]: {
          mode: 'pomodoro',
          settingsSnapshot: {
            flowMin: 25,
            breakMin: 5,
            longBreakMin: 15,
            cycleEvery: 4,
            autoStartBreak: false,
            autoStartSession: false,
          },
          phase: 'flow',
          status: 'running',
          endAt: Date.now() - 1_000,
          remainingMs: 0,
          elapsedMs: 0,
          initialFocusMs: 0,
          startedAt: null,
          cycleCount: 0,
          flexiblePhase: null,
          focusElapsedMs: 0,
          breakElapsedMs: 0,
          breakTargetMs: null,
          breakCompleted: false,
          focusStartedAt: null,
          breakStartedAt: null,
          breakSessionPendingUpdate: false,
          sessions: [],
        },
      },
      pendingAutoSessions: {},
    })

    useTimerStore.getState().commitPendingFocus(TODO_ID)

    expect(useTimerStore.getState().pendingAutoSessions[TODO_ID]).toBeUndefined()
  })

  it('commitPendingFocus는 휴식 중인 stopwatch에서는 아무 것도 추가하지 않는다', () => {
    useTimerStore.setState({
      timers: {
        [TODO_ID]: {
          mode: 'stopwatch',
          settingsSnapshot: null,
          phase: 'flow',
          status: 'paused',
          endAt: null,
          remainingMs: null,
          elapsedMs: 5 * 60 * 1000,
          initialFocusMs: 45 * 60 * 1000,
          startedAt: null,
          cycleCount: 0,
          flexiblePhase: 'break_free',
          focusElapsedMs: 45 * 60 * 1000,
          breakElapsedMs: 5 * 60 * 1000,
          breakTargetMs: null,
          breakCompleted: false,
          focusStartedAt: null,
          breakStartedAt: null,
          breakSessionPendingUpdate: false,
          sessions: [
            {
              sessionFocusSeconds: 45 * 60,
              breakSeconds: 0,
              clientSessionId: '11111111-1111-4111-8111-111111111111',
            },
          ],
        },
      },
      pendingAutoSessions: {},
    })

    useTimerStore.getState().commitPendingFocus(TODO_ID)

    expect(useTimerStore.getState().pendingAutoSessions[TODO_ID]).toBeUndefined()
  })
})
