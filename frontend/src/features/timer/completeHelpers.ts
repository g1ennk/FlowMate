import type { PomodoroSettings, FocusAddResponse, PomodoroCompleteResponse } from '../../api/types'
import { MIN_FLOW_MS } from '../../lib/constants'
import type { SessionRecord, SingleTimerState, TimerMode } from './timerStore'
import { getPlannedMs as getPlannedMsUtil } from './timerHelpers'

type CompleteTodoArgs = { id: string; body: { durationSec: number } }
type UpdateTodoArgs = { id: string; patch: { isDone: boolean; timerMode: TimerMode | null } }

type CompletionDeps = {
  todoId: string
  timer: SingleTimerState
  settings?: PomodoroSettings
  pause: (todoId: string) => void
  getTimer: (todoId: string) => SingleTimerState | undefined
  updateSessionHistory: (todoId: string, sessionHistory: SessionRecord[]) => void
  updateInitialFocusMs: (todoId: string, newInitialFocusMs: number) => void
  completeTodo: (args: CompleteTodoArgs) => Promise<PomodoroCompleteResponse>
  addFocus: (args: CompleteTodoArgs) => Promise<FocusAddResponse>
  updateTodo: (args: UpdateTodoArgs) => Promise<unknown>
  debug?: boolean
}

async function completeStopwatch(deps: CompletionDeps, timer: SingleTimerState) {
  const { todoId, completeTodo, addFocus, updateInitialFocusMs, updateSessionHistory, debug } = deps

  const currentFocusMs = timer.focusElapsedMs ?? timer.elapsedMs
  const initialMs = timer.initialFocusMs ?? 0
  const currentSessionMs = currentFocusMs - initialMs

  let currentBreakMs = timer.breakElapsedMs ?? 0
  if (
    timer.breakStartedAt &&
    (timer.flexiblePhase === 'break_suggested' || timer.flexiblePhase === 'break_free')
  ) {
    const delta = Date.now() - timer.breakStartedAt
    currentBreakMs = timer.breakElapsedMs + delta
  }

  const newSessionHistory = [...timer.sessionHistory]

  if (currentSessionMs >= MIN_FLOW_MS) {
    const isInFocus = timer.flexiblePhase === 'focus' || !timer.flexiblePhase
    const isInBreak =
      timer.flexiblePhase === 'break_suggested' || timer.flexiblePhase === 'break_free'

    if (isInFocus) {
      newSessionHistory.push({ focusMs: currentSessionMs, breakMs: 0 })
    } else if (isInBreak && newSessionHistory.length > 0) {
      newSessionHistory[newSessionHistory.length - 1] = {
        ...newSessionHistory[newSessionHistory.length - 1],
        breakMs: currentBreakMs,
      }
    } else {
      newSessionHistory.push({ focusMs: currentSessionMs, breakMs: 0 })
    }
  } else if (newSessionHistory.length > 0) {
    newSessionHistory[newSessionHistory.length - 1] = {
      ...newSessionHistory[newSessionHistory.length - 1],
      breakMs: currentBreakMs,
    }
  }

  const totalFocusMs = newSessionHistory.reduce((sum, session) => sum + session.focusMs, 0)
  const totalFocusSec = Math.round(totalFocusMs / 1000)

  const currentSessionSec = Math.round(currentSessionMs / 1000)

  if (debug) {
    console.log('[일반 타이머 완료]', {
      currentFocusMs,
      initialMs,
      currentSessionMs,
      currentSessionMsSeconds: Math.round(currentSessionMs / 1000),
      totalFocusMs,
      totalFocusSec,
      currentSessionSec,
      MIN_FLOW_MS,
      MIN_FLOW_MSSeconds: Math.round(MIN_FLOW_MS / 1000),
      oldSessionHistoryLength: timer.sessionHistory.length,
      newSessionHistoryLength: newSessionHistory.length,
      oldSessionHistory: timer.sessionHistory,
      newSessionHistory: newSessionHistory,
      isValid: currentSessionMs >= MIN_FLOW_MS,
    })
  }

  if (currentSessionSec > 0) {
    const isCurrentSessionValid = currentSessionMs >= MIN_FLOW_MS

    if (isCurrentSessionValid) {
      const response = await completeTodo({ id: todoId, body: { durationSec: currentSessionSec } })
      updateInitialFocusMs(todoId, response.focusSeconds * 1000)
    } else {
      const response = await addFocus({ id: todoId, body: { durationSec: currentSessionSec } })
      updateInitialFocusMs(todoId, response.focusSeconds * 1000)
    }
  }

  const hasNewSession = newSessionHistory.length > timer.sessionHistory.length
  const hasBreakUpdate =
    newSessionHistory.length > 0 &&
    newSessionHistory.length === timer.sessionHistory.length &&
    newSessionHistory[newSessionHistory.length - 1]?.breakMs !==
      timer.sessionHistory[timer.sessionHistory.length - 1]?.breakMs

  if (hasNewSession || hasBreakUpdate || newSessionHistory.length > 0) {
    updateSessionHistory(todoId, newSessionHistory)
  }
}

async function completePomodoro(
  deps: CompletionDeps,
  timer: SingleTimerState,
  settings?: PomodoroSettings,
) {
  const { todoId, completeTodo, addFocus, updateSessionHistory } = deps

  if (timer.phase !== 'flow') {
    return
  }

  const plannedMs = getPlannedMsUtil(timer, settings)
  const remaining =
    timer.remainingMs ?? (timer.endAt ? Math.max(0, timer.endAt - Date.now()) : 0)
  const elapsedMs = plannedMs - remaining
  const elapsedSec = Math.round(elapsedMs / 1000)

  const newSessionHistory = [...timer.sessionHistory]

  if (elapsedMs >= MIN_FLOW_MS && elapsedSec > 0) {
    newSessionHistory.push({ focusMs: elapsedMs, breakMs: 0 })
    updateSessionHistory(todoId, newSessionHistory)
  }

  if (elapsedSec > 0) {
    if (remaining < 5000) {
      await completeTodo({ id: todoId, body: { durationSec: elapsedSec } })
    } else {
      await addFocus({ id: todoId, body: { durationSec: elapsedSec } })
    }
  }
}

export async function completeTaskFromTimer(deps: CompletionDeps) {
  const { todoId } = deps
  let timer = deps.timer

  if (timer.status === 'running') {
    deps.pause(todoId)
    const pausedTimer = deps.getTimer(todoId)
    if (!pausedTimer) return
    timer = pausedTimer
  }

  if (timer.mode === 'stopwatch') {
    await completeStopwatch(deps, timer)
  } else if (timer.mode === 'pomodoro') {
    await completePomodoro(deps, timer, deps.settings)
  }

  await deps.updateTodo({
    id: todoId,
    patch: { isDone: true, timerMode: timer.mode },
  })
}
