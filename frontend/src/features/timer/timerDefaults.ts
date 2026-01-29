import type { SingleTimerState } from './timerTypes'

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
  sessionHistory: [],
}
