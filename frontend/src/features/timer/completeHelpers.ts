import type { PomodoroSettings } from '../../api/types'
import { MIN_FLOW_MS } from '../../lib/constants'
import type { SessionRecord, SingleTimerState, TimerMode } from './timerStore'
import {
  getPlannedMs as getPlannedMsUtil,
  getPomodoroElapsedMs,
} from './timerHelpers'
import { resolveSessionIdentity, resolveSessionRecordId } from './timerSessionIdentity'

type UpdateTodoArgs = {
  id: string
  patch: { isDone: boolean; timerMode: TimerMode | null; dayOrder?: number }
}

type CompletionDeps = {
  todoId: string
  timer: SingleTimerState
  settings?: PomodoroSettings
  pause: (todoId: string) => void
  reset: (todoId: string) => void
  getTimer: (todoId: string) => SingleTimerState | undefined
  updateTodo: (args: UpdateTodoArgs) => Promise<unknown>
  syncSessionsImmediately?: (sessions: SessionRecord[]) => Promise<void>
  nextOrder?: number
  debug?: boolean
}

async function completeStopwatch(deps: CompletionDeps, timer: SingleTimerState) {
  const { todoId, debug } = deps
  const activeSessionId = resolveSessionIdentity(todoId, timer).activeSessionId

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

  const newSessions = timer.sessions.map((session, index) => ({
    ...session,
    clientSessionId: resolveSessionRecordId(todoId, timer, session, index),
  }))
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
    } else if (shouldRecordCurrentSession) {
      // 호환성: 과거 상태(휴식 진입 시 미기록)라면 완료 시점에 보정 기록
      newSessions.push({
        sessionFocusSeconds: currentSessionSec,
        breakSeconds: currentBreakSec,
        clientSessionId: activeSessionId,
      })
    }
  } else if (shouldRecordCurrentSession) {
    newSessions.push({
      sessionFocusSeconds: currentSessionSec,
      breakSeconds: 0,
      clientSessionId: activeSessionId,
    })
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

  // 마지막 1건이 아니라 전체 sessions 를 sync 한다. background sync 가 미완료된
  // 잔여 sessions 도 완료 시점에 책임지고 보내기 위함 (멱등 처리되어 안전).
  //
  // NOTE: 여기서 timerStore 의 sessions 를 갱신(updateSessions)하지 않는다.
  // 완료 직후 reset(todoId) 이 타이머를 곧바로 제거하므로 store 갱신은 버려지는
  // write 이고, 그 사이 완료 확인 모달이 재렌더되면 현재 세션이 sessions 에도,
  // focusElapsed 에도 남아 총 Flow 시간이 두 배로 표시되는 결함이 있었다.
  if (newSessions.length > 0) {
    await deps.syncSessionsImmediately?.(newSessions)
  }
}

async function completePomodoro(
  deps: CompletionDeps,
  timer: SingleTimerState,
  settings?: PomodoroSettings,
) {
  const { todoId } = deps
  const activeSessionId = resolveSessionIdentity(todoId, timer).activeSessionId

  if (timer.phase !== 'flow') {
    return
  }

  const plannedMs = getPlannedMsUtil(timer, settings)
  const elapsedMs = getPomodoroElapsedMs(timer, plannedMs)
  const elapsedSec = Math.round(elapsedMs / 1000)

  const newSessions = timer.sessions.map((session, index) => ({
    ...session,
    clientSessionId: resolveSessionRecordId(todoId, timer, session, index),
  }))

  if (elapsedMs >= MIN_FLOW_MS && elapsedSec > 0) {
    newSessions.push({
      sessionFocusSeconds: elapsedSec,
      breakSeconds: 0,
      clientSessionId: activeSessionId,
    })

    // 마지막 1건이 아니라 전체 sessions 를 sync 한다 (멱등 처리, background sync 잔여분 보존).
    // completeStopwatch 와 동일하게 store 의 sessions 는 갱신하지 않는다 (reset 으로 폐기 +
    // 모달 이중 집계 방지). syncSessionsImmediately 가 서버 반영을 책임진다.
    await deps.syncSessionsImmediately?.(newSessions)
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

  // session POST 이후 Todo 응답이 커밋된 세션 집계를 반환한다.
  // 이 사이에 로컬 delta 를 더하면 선행 refetch 값과 이중 집계될 수 있다.
  await deps.updateTodo({
    id: todoId,
    patch: {
      isDone: true,
      timerMode: timer.mode,
      ...(deps.nextOrder === undefined ? {} : { dayOrder: deps.nextOrder }),
    },
  })

  deps.reset(todoId)
}
