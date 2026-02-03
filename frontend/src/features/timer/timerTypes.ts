import type { PomodoroSettings } from '../../api/types'

export type TimerPhase = 'flow' | 'short' | 'long'
export type TimerStatus = 'idle' | 'running' | 'paused' | 'waiting'
export type TimerMode = 'pomodoro' | 'stopwatch'
export type FlexiblePhase = 'focus' | 'break_suggested' | 'break_free'

export type SessionRecord = {
  sessionFocusSeconds: number
  breakSeconds: number
}

export type SingleTimerState = {
  mode: TimerMode
  phase: TimerPhase
  status: TimerStatus
  endAt: number | null
  remainingMs: number | null
  elapsedMs: number
  initialFocusMs: number
  startedAt: number | null
  cycleCount: number
  settingsSnapshot: PomodoroSettings | null

  // Flexible timer (stopwatch) 전용 필드
  flexiblePhase: FlexiblePhase | null
  focusElapsedMs: number
  breakElapsedMs: number
  breakTargetMs: number | null
  breakCompleted: boolean
  focusStartedAt: number | null
  breakStartedAt: number | null
  sessions: SessionRecord[]
}
