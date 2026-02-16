import type { PomodoroSettings } from '../../api/types'

export type TimerPhase = 'flow' | 'short' | 'long'
export type TimerStatus = 'idle' | 'running' | 'paused' | 'waiting'
export type TimerMode = 'pomodoro' | 'stopwatch'
export type FlexiblePhase = 'focus' | 'break_suggested' | 'break_free'

export type SessionRecord = {
  sessionFocusSeconds: number
  breakSeconds: number
  clientSessionId?: string
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
  // 휴식 중 마지막 세션의 breakSeconds를 확정해야 하는지 여부
  breakSessionPendingUpdate: boolean
  // 로컬 세션 버퍼(동기화/런타임 보조용). 집계 정본으로 사용하지 않는다.
  sessions: SessionRecord[]
}
