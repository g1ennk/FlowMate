import type { PomodoroSettings, Session, SessionCreateRequest } from '../../api/types'
import { MIN_FLOW_MS } from '../../lib/constants'
import type { SessionRecord, SingleTimerState, TimerMode } from './timerStore'
import { getPlannedMs as getPlannedMsUtil } from './timerHelpers'

type CreateSessionArgs = { todoId: string; body: SessionCreateRequest }
type UpdateTodoArgs = {
  id: string
  patch: { isDone: boolean; timerMode: TimerMode | null; dayOrder?: number }
}

type CompletionDeps = {
  todoId: string
  timer: SingleTimerState
  settings?: PomodoroSettings
  pause: (todoId: string) => void
  getTimer: (todoId: string) => SingleTimerState | undefined
  updateSessions: (todoId: string, sessions: SessionRecord[]) => void
  createSession: (args: CreateSessionArgs) => Promise<Session>
  updateTodo: (args: UpdateTodoArgs) => Promise<unknown>
  nextOrder?: number
  debug?: boolean
}

async function completeStopwatch(deps: CompletionDeps, timer: SingleTimerState) {
  const { todoId, updateSessions, debug } = deps

  const currentFocusMs = timer.focusElapsedMs ?? timer.elapsedMs
  const initialMs = timer.initialFocusMs ?? 0

  let currentBreakMs = timer.breakElapsedMs ?? 0
  if (
    timer.breakStartedAt &&
    (timer.flexiblePhase === 'break_suggested' || timer.flexiblePhase === 'break_free')
  ) {
    const delta = Date.now() - timer.breakStartedAt
    currentBreakMs = timer.breakElapsedMs + delta
  }

  const newSessions = [...timer.sessions]
  const isInBreak =
    timer.flexiblePhase === 'break_suggested' || timer.flexiblePhase === 'break_free'

  const recordedMs = newSessions.reduce(
    (sum, session) => sum + session.sessionFocusSeconds * 1000,
    0,
  )
  const baselineMs = Math.max(initialMs, recordedMs)
  const currentSessionMs = Math.max(0, currentFocusMs - baselineMs)
  const currentSessionSec = Math.round(currentSessionMs / 1000)
  const currentBreakSec = Math.round(currentBreakMs / 1000)

  const hasRecordedSession =
    currentSessionMs <= 0 ||
    (isInBreak &&
      timer.breakCompleted &&
      newSessions.length > 0 &&
      newSessions[newSessions.length - 1].sessionFocusSeconds === currentSessionSec)

  if (!hasRecordedSession && currentSessionMs >= MIN_FLOW_MS && currentSessionSec > 0) {
    newSessions.push({
      sessionFocusSeconds: currentSessionSec,
      breakSeconds: isInBreak ? currentBreakSec : 0,
    })
  } else if (isInBreak && newSessions.length > 0 && hasRecordedSession) {
    newSessions[newSessions.length - 1] = {
      ...newSessions[newSessions.length - 1],
      breakSeconds: currentBreakSec,
    }
  }

  const totalFocusSec = newSessions.reduce((sum, session) => sum + session.sessionFocusSeconds, 0)

  if (debug) {
    console.log('[일반 타이머 완료]', {
      currentFocusMs,
      initialMs,
      currentSessionMs,
      currentSessionMsSeconds: Math.round(currentSessionMs / 1000),
      totalFocusSec,
      currentSessionSec,
      MIN_FLOW_MS,
      MIN_FLOW_MSSeconds: Math.round(MIN_FLOW_MS / 1000),
      oldSessionsLength: timer.sessions.length,
      newSessionsLength: newSessions.length,
      oldSessions: timer.sessions,
      newSessions,
      isValid: currentSessionMs >= MIN_FLOW_MS,
    })
  }

  const sessionsChanged =
    newSessions.length !== timer.sessions.length ||
    (newSessions.length > 0 &&
      timer.sessions.length > 0 &&
      newSessions[newSessions.length - 1]?.breakSeconds !==
        timer.sessions[timer.sessions.length - 1]?.breakSeconds)

  if (sessionsChanged) {
    updateSessions(todoId, newSessions)
  }
}

async function completePomodoro(
  deps: CompletionDeps,
  timer: SingleTimerState,
  settings?: PomodoroSettings,
) {
  const { todoId, createSession, updateSessions } = deps

  if (timer.phase !== 'flow') {
    return
  }

  const plannedMs = getPlannedMsUtil(timer, settings)
  const remaining =
    timer.remainingMs ?? (timer.endAt ? Math.max(0, timer.endAt - Date.now()) : 0)
  const elapsedMs = plannedMs - remaining
  const elapsedSec = Math.round(elapsedMs / 1000)

  const newSessions = [...timer.sessions]

  if (elapsedMs >= MIN_FLOW_MS && elapsedSec > 0) {
    newSessions.push({ sessionFocusSeconds: elapsedSec, breakSeconds: 0 })
    updateSessions(todoId, newSessions)
  }

  if (elapsedSec > 0) {
    await createSession({
      todoId,
      body: {
        sessionFocusSeconds: elapsedSec,
        breakSeconds: 0,
      },
    })
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
    patch: {
      isDone: true,
      timerMode: timer.mode,
      ...(deps.nextOrder === undefined ? {} : { dayOrder: deps.nextOrder }),
    },
  })
}
