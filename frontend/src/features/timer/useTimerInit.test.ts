import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PomodoroSettings } from '../../api/types'
import { useTimerStore } from './timerStore'
import { useTimerInit } from './useTimerInit'

vi.mock('../../lib/sound', () => ({
  playNotificationSound: vi.fn(),
}))

const TODO_ID = 'todo-1'

const settings: PomodoroSettings = {
  flowMin: 25,
  breakMin: 5,
  longBreakMin: 15,
  cycleEvery: 4,
  autoStartBreak: false,
  autoStartSession: false,
}

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    isOpen: true,
    todoId: TODO_ID,
    selectedMode: null,
    baseSessionFocusSeconds: 0,
    settings,
    endMusicSession: vi.fn(),
    onMounted: vi.fn(),
    onUnmounted: vi.fn(),
    onSelectedModeChange: vi.fn(),
    onResetDisplayState: vi.fn(),
    syncTimerMode: vi.fn(),
    ...overrides,
  } as Parameters<typeof useTimerInit>[0]
}

describe('useTimerInit — mode 전환 시 진행 중 focus 보존 (2026-05-11 prod 사고 회귀)', () => {
  beforeEach(() => {
    useTimerStore.getState().clearAll()
  })

  afterEach(() => {
    useTimerStore.getState().clearAll()
  })

  it('이미 stopwatch focus 가 진행 중인데 initialMode=pomodoro 로 열리면, reset 전에 누적 focus 가 pendingAutoSessions 로 보존된다', () => {
    const FIRST_SID = '11111111-1111-4111-8111-111111111111'

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
            {
              sessionFocusSeconds: 45 * 60,
              breakSeconds: 20 * 60,
              clientSessionId: FIRST_SID,
            },
          ],
        },
      },
      pendingAutoSessions: {},
    })

    renderHook(() => useTimerInit(baseProps({ initialMode: 'pomodoro' })))

    const pending = useTimerStore.getState().pendingAutoSessions[TODO_ID]
    expect(pending).toBeDefined()
    expect(pending).toHaveLength(1)
    expect(pending![0]).toMatchObject({
      sessionFocusSeconds: 75 * 60,
      breakSeconds: 0,
    })

    const timer = useTimerStore.getState().timers[TODO_ID]
    expect(timer?.mode).toBe('pomodoro')
  })
})
