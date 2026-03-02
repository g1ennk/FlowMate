import { initialSingleTimerState } from './timerDefaults'
import type { SingleTimerState } from './timerTypes'

export function hydrateState(state: SingleTimerState): SingleTimerState {
  const now = Date.now()
  let endAt = state.endAt
  let remainingMs = state.remainingMs
  let elapsedMs = state.elapsedMs ?? 0
  let focusElapsedMs = state.focusElapsedMs ?? 0
  let breakElapsedMs = state.breakElapsedMs ?? 0
  let focusStartedAt = state.focusStartedAt ?? null
  let breakStartedAt = state.breakStartedAt ?? null

  if (state.mode === 'pomodoro' && state.status === 'running' && endAt) {
    const left = endAt - now
    if (left <= 0) {
      return {
        ...initialSingleTimerState,
        mode: state.mode,
        settingsSnapshot: state.settingsSnapshot,
        sessions: state.sessions ?? [],
      }
    }
    remainingMs = left
  }

  if (state.status === 'paused' && endAt) {
    remainingMs = Math.max(0, endAt - now)
    endAt = null
  }

  if (state.mode === 'stopwatch') {
    const phase = state.flexiblePhase

    if (state.status === 'running') {
      if (phase === 'focus' && focusStartedAt) {
        const delta = now - focusStartedAt
        focusElapsedMs = state.focusElapsedMs + delta
        focusStartedAt = now
      }

      if ((phase === 'break_suggested' || phase === 'break_free') && breakStartedAt) {
        const delta = now - breakStartedAt
        breakElapsedMs = state.breakElapsedMs + delta
        breakStartedAt = now
      }
    }

    if (state.status === 'paused') {
      if (phase === 'focus' && focusStartedAt) {
        const delta = now - focusStartedAt
        focusElapsedMs = state.focusElapsedMs + delta
        focusStartedAt = null
      }

      if ((phase === 'break_suggested' || phase === 'break_free') && breakStartedAt) {
        const delta = now - breakStartedAt
        breakElapsedMs = state.breakElapsedMs + delta
        breakStartedAt = null
      }
    }
  }

  elapsedMs = state.elapsedMs ?? elapsedMs

  return {
    ...state,
    endAt,
    remainingMs,
    elapsedMs,
    focusElapsedMs,
    breakElapsedMs,
    focusStartedAt,
    breakStartedAt,
    breakSessionPendingUpdate: state.breakSessionPendingUpdate ?? false,
    sessions: state.sessions ?? [],
  }
}
