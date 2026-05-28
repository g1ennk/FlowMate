import { describe, it, expect, vi } from 'vitest'
import { useTimerStore } from './timerStore'
import type { PomodoroSettings } from '../../api/types'

const SETTINGS: PomodoroSettings = {
  flowMin: 25,
  breakMin: 5,
  longBreakMin: 15,
  cycleEvery: 4,
  autoStartBreak: false,
  autoStartSession: false,
}

describe('timer tick performance', () => {
  it('running timer 가 있으면 매 틱마다 timers identity 가 갱신된다 (구독자 리렌더 트리거)', () => {
    useTimerStore.setState({ timers: {}, pendingAutoSessions: {} })
    useTimerStore.getState().startPomodoro('todo-1', SETTINGS)

    let identityChanges = 0
    let lastTimersRef = useTimerStore.getState().timers
    const unsub = useTimerStore.subscribe((state) => {
      if (state.timers !== lastTimersRef) {
        identityChanges++
        lastTimersRef = state.timers
      }
    })

    const TICKS = 10
    for (let i = 0; i < TICKS; i++) {
      useTimerStore.getState().tick()
    }
    unsub()

    // running 타이머에서는 매 tick 이 set 을 호출해야 한다 — early-return 이 잘못 적용되면 0이 된다.
    expect(identityChanges).toBe(TICKS)
  })

  it('idle (running 타이머 0개) 상태에서 tick 은 Object.entries 를 호출하지 않고 즉시 리턴한다', () => {
    useTimerStore.setState({ timers: {}, pendingAutoSessions: {} })

    const entriesSpy = vi.spyOn(Object, 'entries')
    try {
      for (let i = 0; i < 10; i++) {
        useTimerStore.getState().tick()
      }
      // early-return 이 빠지면 매 tick 마다 Object.entries(timers) 가 호출되어 spy 가 트리거된다.
      // (Zustand 내부에서도 Object.entries 를 쓸 수 있으니, timers 인자로 호출된 것만 카운트한다.)
      const callsWithTimers = entriesSpy.mock.calls.filter(([arg]) => arg === useTimerStore.getState().timers)
      expect(callsWithTimers).toHaveLength(0)
    } finally {
      entriesSpy.mockRestore()
    }
  })

  it('paused 타이머만 있는 상태에서도 tick 은 early-return 한다', () => {
    useTimerStore.setState({ timers: {}, pendingAutoSessions: {} })
    useTimerStore.getState().startPomodoro('todo-1', SETTINGS)
    useTimerStore.getState().pause('todo-1')

    let identityChanges = 0
    let lastTimersRef = useTimerStore.getState().timers
    const unsub = useTimerStore.subscribe((state) => {
      if (state.timers !== lastTimersRef) {
        identityChanges++
        lastTimersRef = state.timers
      }
    })

    for (let i = 0; i < 10; i++) {
      useTimerStore.getState().tick()
    }
    unsub()

    expect(identityChanges).toBe(0)
  })
})
