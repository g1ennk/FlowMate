import { useEffect } from 'react'
import { buildApiUrl } from '../../api/baseUrl'
import { timerApi, type ServerTimerState, type TimerStatePushBody } from '../../api/timerApi'
import { useAuthStore } from '../../store/authStore'
import { shouldRefreshSseToken } from './sseAuth'
import { getIsApplyingRemote, useTimerStore } from './timerStore'
import { useSseStatusStore } from './sseStatusStore'
import {
  type RetryState,
  canRetry,
  clearRetry,
  computeRetryDelayMs,
  isNotFoundError,
  markRetry,
} from './timerSyncRetry'

// heartbeat는 약 25초마다 온다. 60초 넘게 아무 이벤트가 없으면 끊긴 연결로 보고 새로 연다.
const SSE_STALE_MS = 60_000
const SSE_WATCHDOG_INTERVAL_MS = 15_000
const PUSH_RESYNC_INTERVAL_MS = 5_000

const pendingResync = new Set<string>()
const pushRetries: RetryState = {}
const pushQueues = new Map<string, { latest: TimerStatePushBody; cancelled: boolean }>()
const mockEnabled =
  import.meta.env.VITE_USE_MOCK === 'true' || import.meta.env.VITE_USE_MOCK === '1'

let sseRefreshing = false
let lastSseRefreshAt = 0

async function enqueuePush(todoId: string, body: TimerStatePushBody): Promise<void> {
  const existing = pushQueues.get(todoId)
  if (existing) {
    existing.latest = body
    return
  }

  const slot = { latest: body, cancelled: false }
  pushQueues.set(todoId, slot)

  while (true) {
    if (slot.cancelled) {
      pushQueues.delete(todoId)
      return
    }

    const snapshot = slot.latest
    let succeeded = false
    let todoMissing = false

    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (slot.latest !== snapshot || slot.cancelled) break

      try {
        const pushedState = await timerApi.pushState(todoId, snapshot)
        if (!slot.cancelled) {
          useTimerStore.getState().recordPushedVersion(todoId, pushedState.version)
        }
        succeeded = true
        break
      } catch (error) {
        // Todo가 삭제됐으면 다시 보내도 404다. 재시도하지 않는다.
        if (isNotFoundError(error)) {
          todoMissing = true
          break
        }
        if (attempt < 2) {
          await new Promise((resolve) => window.setTimeout(resolve, 1000 * 2 ** attempt))
        }
      }
    }

    if (succeeded || todoMissing) {
      pendingResync.delete(todoId)
      clearRetry(pushRetries, todoId)
    } else if (slot.latest === snapshot && !slot.cancelled) {
      pendingResync.add(todoId)
      markRetry(pushRetries, todoId)
    }

    if (slot.latest === snapshot || slot.cancelled) {
      pushQueues.delete(todoId)
      return
    }
  }
}

function getPrincipal(auth: ReturnType<typeof useAuthStore.getState>): string | null {
  if (!auth.state) return null
  if (auth.state.type === 'guest') return 'guest'
  return `member:${auth.state.user.id}`
}

// 끊겨 있던 동안 놓친 변경을 메우기 위해 서버의 현재 타이머 상태를 한 번 받아 적용한다
function resyncActiveStates(principal: string | null) {
  timerApi.getActiveStates()
    .then((states) => {
      if (getPrincipal(useAuthStore.getState()) !== principal) return
      states.forEach(({ todoId, state, version }) => {
        if (!todoId || !state) return
        useTimerStore.getState().applyRemoteState(todoId, state, version)
      })
    })
    .catch(() => {})
}

function connectSse(token: string): EventSource {
  const es = new EventSource(buildApiUrl(`/timer/sse?token=${encodeURIComponent(token)}`))
  useSseStatusStore.getState().setStatus('connecting')

  es.addEventListener('connected', () => {
    useSseStatusStore.getState().setStatus('connected')
  })

  es.addEventListener('timer-state', (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data) as ServerTimerState
      if (!data.todoId) return

      if (data.state) {
        useTimerStore.getState().applyRemoteState(data.todoId, data.state, data.version)
        return
      }

      useTimerStore.getState().applyRemoteReset(data.todoId, data.version)
    } catch {
      // ignore invalid payloads
    }
  })

  return es
}

export function useSseTimerSync() {
  useEffect(() => {
    if (mockEnabled) return

    let es: EventSource | null = null
    let lastEventAt = 0
    let reconnectAttempt = 0
    let reconnectTimer: number | null = null
    // 같은 사용자로 한 번 연결된 뒤의 connected는 재연결이다
    let connectedOnce = false
    let disposed = false

    const clearReconnectTimer = () => {
      if (reconnectTimer === null) return
      window.clearTimeout(reconnectTimer)
      reconnectTimer = null
    }

    const close = () => {
      clearReconnectTimer()
      es?.close()
      es = null
    }

    // 토큰은 연결할 때마다 스토어에서 읽는다. 토큰만 갱신될 때는 연결을 유지하고 다음 재연결에 쓴다.
    const open = () => {
      close()
      const auth = useAuthStore.getState()
      if (auth.state?.type !== 'member') return

      const principal = getPrincipal(auth)
      const source = connectSse(auth.state.accessToken)
      const markAlive = () => {
        lastEventAt = Date.now()
      }
      es = source
      markAlive()

      source.addEventListener('connected', () => {
        markAlive()
        reconnectAttempt = 0
        if (connectedOnce) resyncActiveStates(principal)
        connectedOnce = true
      })
      source.addEventListener('heartbeat', markAlive)
      source.addEventListener('timer-state', markAlive)
      source.onerror = () => {
        if (es !== source) return
        useSseStatusStore.getState().setStatus('connecting')
        // CONNECTING이면 브라우저가 스스로 다시 붙는다.
        // 502나 401처럼 SSE가 아닌 응답을 받으면 CLOSED로 멈추므로 직접 다시 연결한다.
        if (source.readyState === EventSource.CLOSED) scheduleReconnect()
      }
    }

    const reconnect = async () => {
      clearReconnectTimer()
      const authState = useAuthStore.getState().state
      if (authState?.type !== 'member') return

      const now = Date.now()
      if (!sseRefreshing && shouldRefreshSseToken(authState.accessToken, lastSseRefreshAt, now)) {
        sseRefreshing = true
        lastSseRefreshAt = now
        try {
          await useAuthStore.getState().refresh()
        } catch {
          // 갱신에 실패해도 다시 연결을 시도한다. 회원 세션이 끝났으면 open()이 건너뛴다.
        } finally {
          sseRefreshing = false
        }
      }

      if (!disposed) open()
    }

    const scheduleReconnect = () => {
      if (reconnectTimer !== null) return
      reconnectAttempt += 1
      reconnectTimer = window.setTimeout(() => {
        void reconnect()
      }, computeRetryDelayMs(reconnectAttempt))
    }

    const isConnectionDead = () =>
      !es || es.readyState === EventSource.CLOSED || Date.now() - lastEventAt > SSE_STALE_MS

    // 주기 점검: 재연결 대기 중이 아니면서 연결이 죽어 있으면 새로 연다
    const watchdog = () => {
      if (useAuthStore.getState().state?.type !== 'member') return
      if (reconnectTimer !== null) return
      if (isConnectionDead()) void reconnect()
    }

    // 화면 복귀·네트워크 복구: 백오프를 기다리지 않고 바로 점검한다
    const checkNow = () => {
      if (document.visibilityState !== 'visible') return
      if (useAuthStore.getState().state?.type !== 'member') return
      if (!isConnectionDead()) return
      reconnectAttempt = 0
      void reconnect()
    }

    let prevPrincipal = getPrincipal(useAuthStore.getState())

    const unsubscribeAuth = useAuthStore.subscribe((auth) => {
      const nextPrincipal = getPrincipal(auth)
      // 같은 사용자의 토큰 갱신(15분마다)으로는 연결을 끊지 않는다
      if (nextPrincipal === prevPrincipal) return
      prevPrincipal = nextPrincipal

      pendingResync.clear()
      Object.keys(pushRetries).forEach((todoId) => clearRetry(pushRetries, todoId))
      pushQueues.forEach((slot) => {
        slot.cancelled = true
      })
      pushQueues.clear()
      sseRefreshing = false
      lastSseRefreshAt = 0
      connectedOnce = false
      reconnectAttempt = 0
      useTimerStore.getState().clearAll()

      if (auth.state?.type !== 'member') {
        close()
        useSseStatusStore.getState().setStatus('disconnected')
        return
      }

      open()
    })

    if (useAuthStore.getState().state?.type === 'member') {
      open()
    }

    const watchdogId = window.setInterval(watchdog, SSE_WATCHDOG_INTERVAL_MS)
    document.addEventListener('visibilitychange', checkNow)
    window.addEventListener('online', checkNow)

    return () => {
      disposed = true
      unsubscribeAuth()
      window.clearInterval(watchdogId)
      document.removeEventListener('visibilitychange', checkNow)
      window.removeEventListener('online', checkNow)
      close()
    }
  }, [])

  useEffect(() => {
    if (mockEnabled) return

    const unsubscribeTimer = useTimerStore.subscribe((state, prev) => {
      if (getIsApplyingRemote()) return
      if (useAuthStore.getState().state?.type !== 'member') return

      for (const [todoId, timer] of Object.entries(state.timers)) {
        const prevTimer = prev.timers[todoId]
        if (timer === prevTimer) continue

        if (!prevTimer && timer.status === 'idle') continue

        const hasTransition =
          timer.status !== prevTimer?.status ||
          timer.phase !== prevTimer?.phase ||
          timer.flexiblePhase !== prevTimer?.flexiblePhase

        if (!hasTransition) continue

        void enqueuePush(todoId, { status: timer.status, state: timer })
      }

      for (const todoId of Object.keys(prev.timers)) {
        if (!state.timers[todoId]) {
          void enqueuePush(todoId, { status: 'idle', state: null })
        }
      }
    })

    // respectBackoff: 주기 재전송은 백오프를 따르고, 화면 복귀·온라인 복구는 바로 보낸다
    const flushPending = (respectBackoff: boolean) => {
      if (useAuthStore.getState().state?.type !== 'member') return
      if (pendingResync.size === 0) return

      const { timers } = useTimerStore.getState()
      pendingResync.forEach((todoId) => {
        if (pushQueues.has(todoId)) return
        if (respectBackoff && !canRetry(pushRetries, todoId)) return

        const timer = timers[todoId]
        const body: TimerStatePushBody = (!timer || timer.status === 'idle')
          ? { status: 'idle', state: null }
          : { status: timer.status, state: timer }

        void enqueuePush(todoId, body)
      })
    }

    const flushNow = () => flushPending(false)
    const intervalId = window.setInterval(() => flushPending(true), PUSH_RESYNC_INTERVAL_MS)
    document.addEventListener('visibilitychange', flushNow)
    window.addEventListener('online', flushNow)

    return () => {
      unsubscribeTimer()
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', flushNow)
      window.removeEventListener('online', flushNow)
    }
  }, [])
}
