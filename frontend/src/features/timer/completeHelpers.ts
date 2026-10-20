import type { PomodoroSettings } from '../../api/types'
import { MIN_FLOW_MS } from '../../lib/constants'
import type { SessionRecord, SingleTimerState, TimerMode } from './timerStore'
import {
  getPlannedMs as getPlannedMsUtil,
  getPomodoroElapsedMs,
} from './timerHelpers'
import { resolveSessionIdentity, resolveSessionRecordId } from './timerSessionIdentity'
import { isPermanentSyncError } from './timerSyncRetry'

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

  const newSessions = timer.sessions.map((session, index) => ({
    ...session,
    clientSessionId: resolveSessionRecordId(todoId, timer, session, index),
  }))

  // 휴식 단계에는 진행 중인 집중이 없다. 다만 집중이 끝날 때 백그라운드 저장이 실패한 기록이 남아 있을 수 있어
  // 완료 전에 이미 기록된 sessions 를 다시 보낸다(멱등). 보내지 못하면 완료하지 않고 실패를 알린다.
  // 예전에는 여기서 바로 반환해서, 저장 실패한 집중이 0분으로 완료되고 성공 토스트가 떴다.
  if (timer.phase !== 'flow') {
    if (newSessions.length > 0) await deps.syncSessionsImmediately?.(newSessions)
    return
  }

  const plannedMs = getPlannedMsUtil(timer, settings)
  const elapsedMs = getPomodoroElapsedMs(timer, plannedMs)
  const elapsedSec = Math.round(elapsedMs / 1000)

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

// 완료 직전에 sessions 를 하나씩 보낸다(syncSessionsImmediately 구현용). 0초 세션은 보내지 않는다.
// 다시 보내도 결과가 같은 오류(400, 404, 409 IDEMPOTENCY_CONFLICT)는 백그라운드 동기화처럼 건너뛴다.
// 던지면 완료가 막히는데, 그런 오류는 몇 번을 눌러도 같아서 "다시 시도해 주세요"가 끝나지 않는다
export async function postSessions(
  sessions: SessionRecord[],
  post: (session: SessionRecord) => Promise<unknown>,
) {
  for (const session of sessions) {
    if (session.sessionFocusSeconds <= 0) continue
    try {
      await post(session)
    } catch (error) {
      if (!isPermanentSyncError(error)) throw error
      console.error('[TimerSync] Skipped a session that cannot be saved', { session, error })
    }
  }
}

export type CompletionResult = 'completed' | 'sessionSaveFailed' | 'completeFailed'

// 완료를 시도하고 어디서 멈췄는지 돌려준다. 집중 기록을 보내다 실패했는지, 기록은 보냈지만 완료 저장이 실패했는지에 따라
// 알리는 말이 다르다(둘 다 완료되지 않았고 타이머는 그대로 남는다).
export async function tryCompleteTaskFromTimer(deps: CompletionDeps): Promise<CompletionResult> {
  const sync = deps.syncSessionsImmediately
  let sessionFailed = false
  try {
    await completeTaskFromTimer({
      ...deps,
      syncSessionsImmediately: sync && (async (sessions) => {
        try {
          await sync(sessions)
        } catch (error) {
          sessionFailed = true
          throw error
        }
      }),
    })
    return 'completed'
  } catch {
    return sessionFailed ? 'sessionSaveFailed' : 'completeFailed'
  }
}
