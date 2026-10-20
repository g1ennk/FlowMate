import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { initialSingleTimerState } from '../features/timer/timerDefaults'
import { useTimerDisplayStore } from '../features/timer/timerDisplayStore'
import { useTimerStore } from '../features/timer/timerStore'
import type { SingleTimerState } from '../features/timer/timerTypes'
import { ActiveTimerTitle } from './ActiveTimerTitle'

vi.mock('../features/todos/hooks', () => ({
  useTodos: () => ({
    data: { items: [{ id: 'a', sessionFocusSeconds: 0 }, { id: 'b', sessionFocusSeconds: 0 }] },
  }),
}))

function stopwatch(status: SingleTimerState['status'], focusElapsedMs: number): SingleTimerState {
  return {
    ...initialSingleTimerState,
    mode: 'stopwatch',
    status,
    flexiblePhase: 'focus',
    initialFocusMs: 60_000,
    focusElapsedMs,
  }
}

function setTimers(timers: Record<string, SingleTimerState>) {
  act(() => {
    useTimerStore.setState({ timers })
  })
}

describe('ActiveTimerTitle', () => {
  beforeEach(() => {
    useTimerDisplayStore.getState().resetDisplay()
    useTimerStore.setState({ timers: {} })
    document.title = 'FlowMate'
  })

  it('타이머가 없으면 기본 제목을 쓴다', () => {
    render(<ActiveTimerTitle />)
    expect(document.title).toBe('FlowMate')
  })

  it('표시 기준 토글을 따라 제목이 바뀐다', () => {
    render(<ActiveTimerTitle />)
    setTimers({ a: stopwatch('running', 150_000) })
    expect(document.title).toBe('집중 1:30')

    act(() => useTimerDisplayStore.getState().setShowTotalFocus(true))
    expect(document.title).toBe('집중 2:30')
  })

  it('마지막으로 진행하던 타이머를 멈추면 그 타이머를 보여준다', () => {
    render(<ActiveTimerTitle />)
    setTimers({ a: stopwatch('paused', 120_000), b: stopwatch('running', 90_000) })
    expect(document.title).toBe('집중 0:30')

    setTimers({ a: stopwatch('paused', 120_000), b: stopwatch('paused', 90_000) })
    expect(document.title).toBe('집중 일시정지 · 0:30')
  })

  it('모든 타이머가 idle이 되면 기본 제목으로 돌아간다', () => {
    render(<ActiveTimerTitle />)
    setTimers({ a: stopwatch('running', 90_000) })
    setTimers({ a: { ...initialSingleTimerState } })
    expect(document.title).toBe('FlowMate')
  })
})
