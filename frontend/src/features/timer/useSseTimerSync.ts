import { useEffect, useRef } from 'react'
import { buildApiUrl } from '../../api/baseUrl'
import { timerApi, type ServerTimerState, type TimerStatePushBody } from '../../api/timerApi'
import { useAuthStore } from '../../store/authStore'
import { shouldRefreshSseToken } from './sseAuth'
import { getIsApplyingRemote, useTimerStore } from './timerStore'

const pendingResync = new Set<string>()
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

    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (slot.latest !== snapshot || slot.cancelled) break

      try {
        await timerApi.pushState(todoId, snapshot)
        succeeded = true
        pendingResync.delete(todoId)
        break
      } catch {
        if (attempt < 2) {
          await new Promise((resolve) => window.setTimeout(resolve, 1000 * 2 ** attempt))
        }
      }
    }

    if (!succeeded && slot.latest === snapshot && !slot.cancelled) {
      pendingResync.add(todoId)
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

function connectSse(token: string): EventSource {
  const es = new EventSource(buildApiUrl(`/timer/sse?token=${encodeURIComponent(token)}`))

  es.addEventListener('timer-state', (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data) as ServerTimerState
      if (!data.todoId) return

      if (data.state) {
        useTimerStore.getState().applyRemoteState(data.todoId, data.state, data.serverTime)
        return
      }

      useTimerStore.getState().applyRemoteReset(data.todoId, data.serverTime)
    } catch {
      // ignore invalid payloads
    }
  })

  es.onerror = () => {
    const authState = useAuthStore.getState().state
    if (authState?.type !== 'member') return

    const now = Date.now()
    if (sseRefreshing || !shouldRefreshSseToken(authState.accessToken, lastSseRefreshAt, now)) return

    sseRefreshing = true
    lastSseRefreshAt = now
    useAuthStore.getState().refresh()
      .catch(() => {})
      .finally(() => {
        sseRefreshing = false
      })
  }

  return es
}

export function useSseTimerSync() {
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (mockEnabled) return

    let prevPrincipal = getPrincipal(useAuthStore.getState())

    const unsubscribeAuth = useAuthStore.subscribe((auth) => {
      const nextPrincipal = getPrincipal(auth)

      if (nextPrincipal !== prevPrincipal) {
        pendingResync.clear()
        pushQueues.forEach((slot) => {
          slot.cancelled = true
        })
        pushQueues.clear()
        sseRefreshing = false
        lastSseRefreshAt = 0
        useTimerStore.getState().clearAll()
      }

      prevPrincipal = nextPrincipal

      if (auth.state?.type !== 'member') {
        esRef.current?.close()
        esRef.current = null
        sseRefreshing = false
        lastSseRefreshAt = 0
        return
      }

      esRef.current?.close()
      esRef.current = connectSse(auth.state.accessToken)
    })

    const current = useAuthStore.getState()
    if (current.state?.type === 'member') {
      esRef.current = connectSse(current.state.accessToken)
    }

    return () => {
      unsubscribeAuth()
      esRef.current?.close()
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

    const flushPending = () => {
      if (useAuthStore.getState().state?.type !== 'member') return
      if (pendingResync.size === 0) return

      const { timers } = useTimerStore.getState()
      pendingResync.forEach((todoId) => {
        const timer = timers[todoId]
        const body: TimerStatePushBody = (!timer || timer.status === 'idle')
          ? { status: 'idle', state: null }
          : { status: timer.status, state: timer }

        void enqueuePush(todoId, body)
      })
    }

    document.addEventListener('visibilitychange', flushPending)
    window.addEventListener('online', flushPending)

    return () => {
      unsubscribeTimer()
      document.removeEventListener('visibilitychange', flushPending)
      window.removeEventListener('online', flushPending)
    }
  }, [])
}
