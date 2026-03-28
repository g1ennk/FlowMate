import type { PomodoroSessionSettings, PomodoroSettings } from '../../api/types'
import type { SingleTimerState } from './timerTypes'

export const DEFAULT_SESSION_SETTINGS: PomodoroSessionSettings = {
  flowMin: 25,
  breakMin: 5,
  longBreakMin: 15,
  cycleEvery: 4,
}

export const DEFAULT_POMODORO_SETTINGS: PomodoroSettings = {
  ...DEFAULT_SESSION_SETTINGS,
  autoStartBreak: false,
  autoStartSession: false,
}

export const initialSingleTimerState: SingleTimerState = {
  mode: 'pomodoro',
  phase: 'flow',
  status: 'idle',
  endAt: null,
  remainingMs: null,
  elapsedMs: 0,
  initialFocusMs: 0,
  startedAt: null,
  cycleCount: 0,
  settingsSnapshot: null,
  // Flexible timer 기본값
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
