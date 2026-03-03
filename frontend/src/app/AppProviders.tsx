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

const mockEnabled =
  import.meta.env.VITE_USE_MOCK === 'true' || import.meta.env.VITE_USE_MOCK === '1'

export function AppProviders({ children }: PropsWithChildren) {
  const [mockReady, setMockReady] = useState(!mockEnabled)
  useTimerTicker()

  // 앱 초기화 시 인증 상태 복원 (mock 모드면 MSW 준비 후 실행)
  useEffect(() => {
    if (!mockReady) return
    useAuthStore.getState().init()
  }, [mockReady])

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
      <TimerSyncLayer />
      <ActiveTimerTitle />
      {children}
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
