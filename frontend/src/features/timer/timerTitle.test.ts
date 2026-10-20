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
  options: { sessionFocusSeconds?: number; showTotalFocus?: boolean } = {},
) {
  return getTimerTitle({
    timer: t,
    sessionFocusSeconds: options.sessionFocusSeconds ?? 0,
    showTotalFocus: options.showTotalFocus ?? false,
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

// 탭 제목은 타이머 화면이 보여 주는 숫자를 그대로 쓴다. 실행 중은 "집중 12:30"처럼 단계 이름을 붙이고(§9),
// 일시정지는 화면 라벨처럼 "집중 일시정지 · 12:30"으로 쓴다
describe('getTimerTitle', () => {
  it('타이머가 없거나 idle이면 null', () => {
    expect(title(undefined)).toBeNull()
    expect(title(timer({ status: 'idle' }))).toBeNull()
  })

  describe('뽀모도로', () => {
    it('진행 중 집중은 남은 시간을 올림으로 표시한다', () => {
      expect(title(timer({ status: 'running', phase: 'flow', endAt: NOW + 1_499_500 }))).toBe('집중 25:00')
    })

    it('진행 중 휴식은 휴식으로 표시한다', () => {
      expect(title(timer({ status: 'running', phase: 'short', endAt: NOW + 299_000 }))).toBe('휴식 4:59')
      expect(title(timer({ status: 'running', phase: 'long', endAt: NOW + 60_000 }))).toBe('휴식 1:00')
    })

    it('일시정지는 단계 이름과 남아 있던 시간을 표시한다', () => {
      expect(title(timer({ status: 'paused', phase: 'flow', endAt: null, remainingMs: 754_000 }))).toBe(
        '집중 일시정지 · 12:34',
      )
      expect(title(timer({ status: 'paused', phase: 'short', endAt: null, remainingMs: 299_000 }))).toBe(
        '휴식 일시정지 · 4:59',
      )
    })

    it('대기 중이면 화면의 단계 끝 줄과 같은 문구로 상태를 표시한다', () => {
      // phase 는 다음 단계를 가리킨다: 휴식을 기다리면 집중이 끝난 것이다
      expect(title(timer({ status: 'waiting', phase: 'short', remainingMs: 300_000 }))).toBe('집중 끝')
      expect(title(timer({ status: 'waiting', phase: 'long', remainingMs: 900_000 }))).toBe('집중 끝')
      expect(title(timer({ status: 'waiting', phase: 'flow', remainingMs: 1_500_000 }))).toBe('휴식 끝')
    })
  })

  describe('일반 타이머 집중', () => {
    it('기본값은 현재 세션 시간이다', () => {
      expect(title(stopwatchFocus())).toBe('집중 2:30')
    })

    it('전체 누적을 고르면 누적 시간을 표시한다', () => {
      expect(title(stopwatchFocus(), { showTotalFocus: true })).toBe('집중 12:30')
    })

    it('전체 누적은 서버 누적값을 하한으로 쓴다', () => {
      expect(title(stopwatchFocus(), { showTotalFocus: true, sessionFocusSeconds: 1_200 })).toBe('집중 20:00')
    })

    it('일시정지도 같은 기준을 따른다', () => {
      expect(title(stopwatchFocus({ status: 'paused' }))).toBe('집중 일시정지 · 2:30')
      expect(title(stopwatchFocus({ status: 'paused' }), { showTotalFocus: true })).toBe('집중 일시정지 · 12:30')
    })
  })

  describe('일반 타이머 휴식', () => {
    it('추천 휴식 목표 전에는 남은 시간을 올림으로 표시한다', () => {
      expect(title(recommendedBreak({ breakElapsedMs: 60_500 }))).toBe('휴식 4:00')
    })

    it('목표를 넘긴 뒤에는 화면 숫자처럼 총 휴식 시간을 표시한다(넘친 시간은 화면 라벨에만 있다)', () => {
      const done = recommendedBreak({ breakElapsedMs: 330_000, breakCompleted: true })
      expect(title(done)).toBe('휴식 5:30')
      // 집중 표시 기준은 휴식 숫자에 영향을 주지 않는다
      expect(title(done, { showTotalFocus: true })).toBe('휴식 5:30')
    })

    it('목표를 넘겼어도 완료 표시 전이면 목표 전 기준으로 계산한다', () => {
      expect(title(recommendedBreak({ status: 'paused', breakElapsedMs: 330_000 }))).toBe('휴식 일시정지 · 0:00')
    })

    it('자유 휴식은 경과 시간을 표시한다', () => {
      expect(title(timer({ mode: 'stopwatch', status: 'running', flexiblePhase: 'break_free', breakElapsedMs: 95_000 }))).toBe(
        '휴식 1:35',
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
