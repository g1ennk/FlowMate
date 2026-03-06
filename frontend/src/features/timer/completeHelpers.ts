import type { PomodoroSettings } from '../../api/types'
import { MIN_FLOW_MS } from '../../lib/constants'
import type { SessionRecord, SingleTimerState, TimerMode } from './timerStore'
import {
  getPlannedMs as getPlannedMsUtil,
  getPomodoroElapsedMs,
} from './timerHelpers'
import { generateSessionId } from '../../lib/sessionId'

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
  updateTodo: (args: UpdateTodoArgs) => Promise<unknown>
  syncSessionsImmediately?: (sessions: SessionRecord[]) => Promise<void>
  applySessionAggregateDelta?: (delta: { focusDeltaSeconds: number; sessionCountDelta: number }) => void
  nextOrder?: number
  debug?: boolean
}

async function completeStopwatch(deps: CompletionDeps, timer: SingleTimerState) {
  const { todoId, updateSessions, debug } = deps

  const oldFocusSec = timer.sessions.reduce((sum, session) => sum + session.sessionFocusSeconds, 0)
  const oldSessionCount = timer.sessions.length
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
  const immediateSyncTargets: SessionRecord[] = []
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
  const shouldRecordCurrentSession = currentSessionMs >= MIN_FLOW_MS && currentSessionSec > 0

  if (isInBreak) {
    if (timer.breakSessionPendingUpdate && newSessions.length > 0) {
      newSessions[newSessions.length - 1] = {
        ...newSessions[newSessions.length - 1],
        breakSeconds: currentBreakSec,
      }
      immediateSyncTargets.push(newSessions[newSessions.length - 1])
    } else if (shouldRecordCurrentSession) {
      // 호환성: 과거 상태(휴식 진입 시 미기록)라면 완료 시점에 보정 기록
      newSessions.push({
        sessionFocusSeconds: currentSessionSec,
        breakSeconds: currentBreakSec,
        clientSessionId: generateSessionId(),
      })
      immediateSyncTargets.push(newSessions[newSessions.length - 1])
    }
  } else if (shouldRecordCurrentSession) {
    newSessions.push({
      sessionFocusSeconds: currentSessionSec,
      breakSeconds: 0,
      clientSessionId: generateSessionId(),
    })
    immediateSyncTargets.push(newSessions[newSessions.length - 1])
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
      isValid: shouldRecordCurrentSession,
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

  const focusDeltaSeconds = Math.max(0, totalFocusSec - oldFocusSec)
  const sessionCountDelta = Math.max(0, newSessions.length - oldSessionCount)
  if (focusDeltaSeconds > 0 || sessionCountDelta > 0) {
    deps.applySessionAggregateDelta?.({ focusDeltaSeconds, sessionCountDelta })
  }

  if (immediateSyncTargets.length > 0) {
    try {
      await deps.syncSessionsImmediately?.(immediateSyncTargets)
    } catch (error) {
      // 즉시 동기화 실패 시에도 로컬 큐/주기 동기화로 eventually 반영되도록 완료 플로우는 유지한다.
      console.error('[completeTaskFromTimer] Immediate stopwatch sync failed', {
        todoId,
        error,
      })
    }
  }
}

async function completePomodoro(
  deps: CompletionDeps,
  timer: SingleTimerState,
  settings?: PomodoroSettings,
) {
  const { todoId, updateSessions } = deps
  const oldFocusSec = timer.sessions.reduce((sum, session) => sum + session.sessionFocusSeconds, 0)
  const oldSessionCount = timer.sessions.length

  if (timer.phase !== 'flow') {
    return
  }

  const plannedMs = getPlannedMsUtil(timer, settings)
  const elapsedMs = getPomodoroElapsedMs(timer, plannedMs)
  const elapsedSec = Math.round(elapsedMs / 1000)

  const newSessions = [...timer.sessions]

  if (elapsedMs >= MIN_FLOW_MS && elapsedSec > 0) {
    newSessions.push({
      sessionFocusSeconds: elapsedSec,
      breakSeconds: 0,
      clientSessionId: generateSessionId(),
    })
    updateSessions(todoId, newSessions)

    const newFocusSec = newSessions.reduce((sum, session) => sum + session.sessionFocusSeconds, 0)
    const focusDeltaSeconds = Math.max(0, newFocusSec - oldFocusSec)
    const sessionCountDelta = Math.max(0, newSessions.length - oldSessionCount)
    if (focusDeltaSeconds > 0 || sessionCountDelta > 0) {
      deps.applySessionAggregateDelta?.({ focusDeltaSeconds, sessionCountDelta })
    }

    try {
      await deps.syncSessionsImmediately?.([newSessions[newSessions.length - 1]])
    } catch (error) {
      // 즉시 동기화 실패 시에도 로컬 큐/주기 동기화로 eventually 반영되도록 완료 플로우는 유지한다.
      console.error('[completeTaskFromTimer] Immediate pomodoro sync failed', {
        todoId,
        error,
      })
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
    patch: {
      isDone: true,
      timerMode: timer.mode,
      ...(deps.nextOrder === undefined ? {} : { dayOrder: deps.nextOrder }),
    },
  })
}
