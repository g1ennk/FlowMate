import { describe, expect, it } from 'vitest'
import { initialSingleTimerState } from './timerDefaults'
import { getTimerTitle, pickTitleTimerId } from './timerTitle'
import type { SingleTimerState } from './timerTypes'

const NOW = 1_000_000

function timer(overrides: Partial<SingleTimerState>): SingleTimerState {
  return { ...initialSingleTimerState, ...overrides }
}

function title(
  t: SingleTimerState | undefined,
  options: { sessionFocusSeconds?: number; showTotalFocus?: boolean; showTotalBreak?: boolean } = {},
) {
  return getTimerTitle({
    timer: t,
    sessionFocusSeconds: options.sessionFocusSeconds ?? 0,
    showTotalFocus: options.showTotalFocus ?? false,
    showTotalBreak: options.showTotalBreak ?? false,
    nowMs: NOW,
  })
}

const stopwatchFocus = (overrides: Partial<SingleTimerState> = {}) =>
  timer({
    mode: 'stopwatch',
    status: 'running',
    flexiblePhase: 'focus',
    initialFocusMs: 600_000,
    focusElapsedMs: 750_000,
    ...overrides,
  })

const recommendedBreak = (overrides: Partial<SingleTimerState> = {}) =>
  timer({
    mode: 'stopwatch',
    status: 'running',
    flexiblePhase: 'break_suggested',
    breakTargetMs: 300_000,
    ...overrides,
  })

describe('getTimerTitle', () => {
  it('타이머가 없거나 idle이면 null', () => {
    expect(title(undefined)).toBeNull()
    expect(title(timer({ status: 'idle' }))).toBeNull()
  })

  describe('뽀모도로', () => {
    it('진행 중 Flow는 남은 시간을 올림으로 표시한다', () => {
      expect(title(timer({ status: 'running', phase: 'flow', endAt: NOW + 1_499_500 }))).toBe('Flow: 25:00')
    })

    it('진행 중 휴식은 휴식으로 표시한다', () => {
      expect(title(timer({ status: 'running', phase: 'short', endAt: NOW + 299_000 }))).toBe('휴식: 4:59')
      expect(title(timer({ status: 'running', phase: 'long', endAt: NOW + 60_000 }))).toBe('휴식: 1:00')
    })

    it('일시정지는 남아 있던 시간을 표시한다', () => {
      expect(title(timer({ status: 'paused', phase: 'flow', endAt: null, remainingMs: 754_000 }))).toBe(
        '일시정지: 12:34',
      )
    })

    it('대기 중이면 다음 단계를 표시한다', () => {
      expect(title(timer({ status: 'waiting', phase: 'short', remainingMs: 300_000 }))).toBe('휴식 대기')
      expect(title(timer({ status: 'waiting', phase: 'long', remainingMs: 900_000 }))).toBe('휴식 대기')
      expect(title(timer({ status: 'waiting', phase: 'flow', remainingMs: 1_500_000 }))).toBe('Flow 대기')
    })
  })

  describe('일반 타이머 집중', () => {
    it('기본값은 현재 세션 시간이다', () => {
      expect(title(stopwatchFocus())).toBe('Flow: 2:30')
    })

    it('전체 누적을 고르면 누적 시간을 표시한다', () => {
      expect(title(stopwatchFocus(), { showTotalFocus: true })).toBe('Flow: 12:30')
    })

    it('전체 누적은 서버 누적값을 하한으로 쓴다', () => {
      expect(title(stopwatchFocus(), { showTotalFocus: true, sessionFocusSeconds: 1_200 })).toBe('Flow: 20:00')
    })

    it('일시정지도 같은 기준을 따른다', () => {
      expect(title(stopwatchFocus({ status: 'paused' }))).toBe('일시정지: 2:30')
      expect(title(stopwatchFocus({ status: 'paused' }), { showTotalFocus: true })).toBe('일시정지: 12:30')
    })
  })

  describe('일반 타이머 휴식', () => {
    it('추천 휴식 목표 전에는 남은 시간을 올림으로 표시한다', () => {
      expect(title(recommendedBreak({ breakElapsedMs: 60_500 }))).toBe('휴식: 4:00')
    })

    it('목표를 넘긴 뒤 기본값은 추가 휴식이다', () => {
      expect(title(recommendedBreak({ breakElapsedMs: 330_000, breakCompleted: true }))).toBe('휴식: 0:30')
    })

    it('총 휴식을 고르면 전체 휴식 시간을 표시한다', () => {
      expect(
        title(recommendedBreak({ breakElapsedMs: 330_000, breakCompleted: true }), { showTotalBreak: true }),
      ).toBe('휴식: 5:30')
    })

    it('목표를 넘겼어도 완료 표시 전이면 목표 전 기준으로 계산한다', () => {
      expect(title(recommendedBreak({ status: 'paused', breakElapsedMs: 330_000 }))).toBe('일시정지: 0:00')
    })

    it('자유 휴식은 경과 시간을 표시한다', () => {
      expect(title(timer({ mode: 'stopwatch', status: 'running', flexiblePhase: 'break_free', breakElapsedMs: 95_000 }))).toBe(
        '휴식: 1:35',
      )
    })
  })
})

describe('pickTitleTimerId', () => {
  const running = timer({ status: 'running' })
  const paused = timer({ status: 'paused' })
  const waiting = timer({ status: 'waiting' })
  const idle = timer({ status: 'idle' })

  it('진행 중인 타이머를 가장 먼저 고른다', () => {
    expect(pickTitleTimerId({ a: paused, b: running }, 'a')).toBe('b')
  })

  it('진행 중이 없으면 마지막으로 진행하던 타이머를 고른다', () => {
    expect(pickTitleTimerId({ a: paused, b: paused }, 'b')).toBe('b')
    expect(pickTitleTimerId({ a: waiting, b: paused }, 'b')).toBe('b')
  })

  it('마지막 진행 기록이 없으면 대기를 일시정지보다 먼저 고른다', () => {
    expect(pickTitleTimerId({ a: paused, b: waiting }, null)).toBe('b')
    expect(pickTitleTimerId({ a: paused, b: idle }, null)).toBe('a')
  })

  it('마지막으로 진행하던 타이머가 idle이면 나머지 순서를 따른다', () => {
    expect(pickTitleTimerId({ a: paused, b: idle }, 'b')).toBe('a')
  })

  it('보여줄 타이머가 없으면 null', () => {
    expect(pickTitleTimerId({ a: idle }, 'a')).toBeNull()
    expect(pickTitleTimerId({}, null)).toBeNull()
  })
})
