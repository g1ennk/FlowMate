import { describe, expect, it } from 'vitest'
import { DEFAULT_POMODORO_SETTINGS, initialSingleTimerState } from '../timer/timerDefaults'
import type { SingleTimerState, TimerMode, TimerStatus } from '../timer/timerTypes'
import { getDisabledReason, getDisabledReasonMessage, showsStartButton } from './timerStartRules'

const todo = { id: 'a', isDone: false }
const timerOf = (mode: TimerMode, status: TimerStatus): SingleTimerState => ({
  ...initialSingleTimerState,
  mode,
  status,
  settingsSnapshot: DEFAULT_POMODORO_SETTINGS,
})
const titles: Record<string, string> = { a: '장보기', b: '은행 들르기' }
const titleOf = (id: string) => titles[id]

describe('getDisabledReason', () => {
  it('막을 이유가 없으면 null', () => {
    expect(getDisabledReason(todo, 'pomodoro', {})).toBeNull()
    expect(getDisabledReason(todo, 'pomodoro', { a: timerOf('pomodoro', 'paused') })).toBeNull()
    expect(getDisabledReason(todo, 'stopwatch', { a: timerOf('pomodoro', 'idle') })).toBeNull()
    expect(getDisabledReason(todo, 'stopwatch', { b: timerOf('pomodoro', 'paused') })).toBeNull()
  })

  it('끝낸 할 일과 다른 할 일에서 실행 중인 타이머를 막는다', () => {
    expect(getDisabledReason({ id: 'a', isDone: true }, 'pomodoro', {})).toEqual({ kind: 'completed' })
    expect(getDisabledReason(todo, 'pomodoro', { b: timerOf('stopwatch', 'running') })).toEqual({
      kind: 'otherRunning',
      todoId: 'b',
    })
  })

  it('같은 할 일에서 시작한 다른 모드 타이머는 실행 중인지 멈췄는지 구분한다', () => {
    expect(getDisabledReason(todo, 'pomodoro', { a: timerOf('stopwatch', 'running') })).toEqual({
      kind: 'sameTodoRunning',
      mode: 'stopwatch',
    })
    expect(getDisabledReason(todo, 'pomodoro', { a: timerOf('stopwatch', 'paused') })).toEqual({
      kind: 'sameTodoPaused',
      mode: 'stopwatch',
    })
    expect(getDisabledReason(todo, 'pomodoro', { a: timerOf('stopwatch', 'waiting') })).toEqual({
      kind: 'sameTodoPaused',
      mode: 'stopwatch',
    })
  })
})

describe('getDisabledReasonMessage', () => {
  it('이유를 해요체 한 줄로 쓰고, 실행 중인 다른 할 일은 이름을 말한다', () => {
    expect(getDisabledReasonMessage({ kind: 'completed' }, titleOf)).toBe('완료한 할 일이에요')
    expect(getDisabledReasonMessage({ kind: 'otherRunning', todoId: 'b' }, titleOf)).toBe(
      "'은행 들르기' 타이머가 실행 중이에요",
    )
    expect(getDisabledReasonMessage({ kind: 'otherRunning', todoId: 'x' }, titleOf)).toBe(
      '다른 할 일의 타이머가 실행 중이에요',
    )
    expect(getDisabledReasonMessage({ kind: 'sameTodoRunning', mode: 'pomodoro' }, titleOf)).toBe(
      '같은 할 일의 뽀모도로가 실행 중이에요',
    )
    expect(getDisabledReasonMessage({ kind: 'sameTodoPaused', mode: 'stopwatch' }, titleOf)).toBe(
      '같은 할 일에 멈춘 일반 타이머가 있어요. 초기화한 뒤 바꿀 수 있어요',
    )
  })
})

describe('showsStartButton', () => {
  it('타이머를 한 번도 쓰지 않은 미완료 할 일에만 ▶를 둔다', () => {
    expect(showsStartButton({ isDone: false, focusSeconds: 0, hasActiveTimer: false })).toBe(true)
    expect(showsStartButton({ isDone: true, focusSeconds: 0, hasActiveTimer: false })).toBe(false)
    expect(showsStartButton({ isDone: false, focusSeconds: 60, hasActiveTimer: false })).toBe(false)
    expect(showsStartButton({ isDone: false, focusSeconds: 0, hasActiveTimer: true })).toBe(false)
  })
})
