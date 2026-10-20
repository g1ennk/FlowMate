import { describe, expect, it } from 'vitest'
import type { SingleTimerState } from './timerTypes'
import { getCompletionSummary } from './completionSummary'

const settings = {
  flowMin: 25,
  breakMin: 5,
  longBreakMin: 15,
  cycleEvery: 4,
  autoStartBreak: false,
  autoStartSession: false,
}

function timer(state: Partial<SingleTimerState>): SingleTimerState {
  return {
    mode: 'stopwatch',
    phase: 'flow',
    status: 'paused',
    endAt: null,
    remainingMs: null,
    elapsedMs: 0,
    initialFocusMs: 0,
    startedAt: null,
    cycleCount: 0,
    settingsSnapshot: settings,
    flexiblePhase: 'focus',
    focusElapsedMs: 0,
    breakElapsedMs: 0,
    breakTargetMs: null,
    breakCompleted: false,
    focusStartedAt: null,
    breakStartedAt: null,
    breakSessionPendingUpdate: false,
    sessions: [],
    ...state,
  } as SingleTimerState
}

const session = (seconds: number) => ({ sessionFocusSeconds: seconds, breakSeconds: 0 }) as SingleTimerState['sessions'][number]

describe('getCompletionSummary', () => {
  it('일반 타이머: 기록된 세션과 기준을 넘긴 현재 세션을 센다', () => {
    const summary = getCompletionSummary(
      timer({ sessions: [session(600)], focusElapsedMs: 900_000, initialFocusMs: 600_000 }),
      25 * 60_000,
    )
    expect(summary).toEqual({ count: 2, focusMs: 900_000 })
  })

  it('일반 타이머: 기준보다 짧은 현재 세션은 세지 않는다(세션 0개면 확인 없이 완료)', () => {
    expect(getCompletionSummary(timer({ focusElapsedMs: 30_000 }), 25 * 60_000)).toEqual({ count: 0, focusMs: 0 })
  })

  it('뽀모도로: 진행 중인 집중의 지난 시간을 더한다', () => {
    const summary = getCompletionSummary(
      timer({ mode: 'pomodoro', flexiblePhase: null, status: 'paused', remainingMs: 15 * 60_000, sessions: [session(1500)] }),
      25 * 60_000,
    )
    expect(summary).toEqual({ count: 2, focusMs: 35 * 60_000 })
  })

  it('뽀모도로: 1분 미만 진행 중 집중은 0개다(완료해도 기록되지 않으므로 확인 없이 완료)', () => {
    const running = getCompletionSummary(
      timer({ mode: 'pomodoro', flexiblePhase: null, status: 'running', endAt: Date.now() + 25 * 60_000 - 5_000, remainingMs: null }),
      25 * 60_000,
    )
    expect(running).toEqual({ count: 0, focusMs: 0 })
    const paused = getCompletionSummary(
      timer({ mode: 'pomodoro', flexiblePhase: null, status: 'paused', remainingMs: 25 * 60_000 - 30_000, sessions: [session(1500)] }),
      25 * 60_000,
    )
    expect(paused).toEqual({ count: 1, focusMs: 1500_000 })
  })

  it('뽀모도로: 시작 전이면 0개다', () => {
    const summary = getCompletionSummary(
      timer({ mode: 'pomodoro', flexiblePhase: null, status: 'idle', remainingMs: 25 * 60_000 }),
      25 * 60_000,
    )
    expect(summary).toEqual({ count: 0, focusMs: 0 })
  })
})
