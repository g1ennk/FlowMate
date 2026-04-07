import type { PropsWithChildren } from 'react'
import { useEffect, useState } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { Toaster } from 'react-hot-toast'
import { timerApi } from '../api/timerApi'
import { queryClient } from './queryClient'
import { startMockWorker } from '../mocks/browser'
import { useSseTimerSync } from '../features/timer/useSseTimerSync'
import { useTimerTicker } from '../features/timer/useTimerTicker'
import { useTimerSyncEffect } from '../features/timer/useTimerSyncEffect'
import { useTimerStore } from '../features/timer/timerStore'
import { ActiveTimerTitle } from './ActiveTimerTitle'
import { useAuthStore } from '../store/authStore'
import { useSystemStore } from '../store/systemStore'
import BackendStatusGate from './BackendStatusGate'

const mockEnabled =
  import.meta.env.VITE_USE_MOCK === 'true' || import.meta.env.VITE_USE_MOCK === '1'

export function AppProviders({ children }: PropsWithChildren) {
  const [mockReady, setMockReady] = useState(!mockEnabled)
  const backendStatus = useSystemStore((s) => s.status)
  useTimerTicker()

  // 앱 초기화 시 인증 상태 복원 (mock 모드면 MSW 준비 후 실행)
  // 백엔드가 available로 확정된 후에만 init() 호출 — 다운 시 fetch 실패가
  // 콘솔에 빨간 메시지로 새지 않도록 한다.
  useEffect(() => {
    if (!mockReady) return
    if (backendStatus !== 'available') return
    useAuthStore.getState().init()
  }, [mockReady, backendStatus])

  useEffect(() => {
    if (!mockEnabled) return
    startMockWorker()
      .catch((err) => {
        console.error('MSW start failed', err)
      })
      .finally(() => setMockReady(true))
  }, [])

  if (!mockReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-200">
        모킹 워커를 준비 중입니다...
      </div>
    )
  }

  return (
    <QueryClientProvider client={queryClient}>
      {/* TimerSyncLayer는 의도적으로 BackendStatusGate 밖에 둠 — 내부 훅들이
          auth 상태로 self-guard되어 백엔드 다운 시 API 호출을 하지 않음.
          타이머 tick 로직은 백엔드 상태와 무관하게 동작해야 함. */}
      <TimerSyncLayer />
      <ActiveTimerTitle />
      <BackendStatusGate>{children}</BackendStatusGate>
      <Toaster
        position="top-center"
        containerStyle={{
          zIndex: 9999,
          marginTop: 'calc(var(--safe-top) + 8px)',
        }}
        toastOptions={{
          duration: 2000,
          style: {
            background: '#363636',
            color: '#fff',
            borderRadius: '12px',
            padding: '12px 16px',
            whiteSpace: 'nowrap',
            maxWidth: 'none',
            width: 'auto',
          },
        }}
      />
      {import.meta.env.DEV ? <ReactQueryDevtools buttonPosition="bottom-left" /> : null}
    </QueryClientProvider>
  )
}

function TimerSyncLayer() {
  useTimerSyncEffect()
  useSseTimerSync()
  useInitialTimerFetch()
  return null
}

function useInitialTimerFetch() {
  const initialized = useAuthStore((state) => state.initialized)
  const userId = useAuthStore((state) =>
    state.state?.type === 'member' ? state.state.user.id : null,
  )

  useEffect(() => {
    if (!initialized || !userId) return

    const requestedUserId = userId

    timerApi.getActiveStates()
      .then((states) => {
        const currentState = useAuthStore.getState().state
        const currentUserId = currentState?.type === 'member' ? currentState.user.id : null

        if (currentUserId !== requestedUserId) return

        states.forEach(({ todoId, state, serverTime }) => {
          if (!todoId || !state) return
          useTimerStore.getState().applyRemoteState(todoId, state, serverTime)
        })
      })
      .catch(() => {})
  }, [initialized, userId])
}
