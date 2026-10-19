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
import { useAppUpdate } from '../features/pwa/useAppUpdate'
import { ActiveTimerTitle } from './ActiveTimerTitle'
import { useAuthStore } from '../store/authStore'
import BackendStatusGate from './BackendStatusGate'
import { useAuthInitRetry } from './useAuthInitRetry'

const mockEnabled =
  import.meta.env.VITE_USE_MOCK === 'true' || import.meta.env.VITE_USE_MOCK === '1'

export function AppProviders({ children }: PropsWithChildren) {
  const [mockReady, setMockReady] = useState(!mockEnabled)
  useTimerTicker()
  useAppUpdate()

  // 앱 초기화 시 인증 상태 복원 (mock 모드면 MSW 준비 후 실행).
  // 과거에는 backendStatus==='available'을 기다렸지만, 그 경우 health→refresh가
  // 직렬로 묶여 cold load에서 1~2초 빈 화면이 발생한다. init()을 health와
  // 병렬로 실행하고, 백엔드 다운은 authStore.init() 내부에서 조용히 처리한다.
  useEffect(() => {
    if (!mockReady) return
    useAuthStore.getState().init()
  }, [mockReady])
  useAuthInitRetry(mockReady)

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
        // BottomSheet·TimerFullScreen(9999), SoundSheet(10000) 포털보다 위에 보이도록 한다.
        containerStyle={{
          zIndex: 10001,
          // 서버 연결 배너가 떠 있으면 그 아래로 내린다 (배너 높이에 safe-top 포함)
          marginTop: 'calc(var(--top-banner-offset, var(--safe-top)) + 8px)',
        }}
        toastOptions={{
          duration: 2000,
          style: {
            background: '#363636',
            color: '#fff',
            borderRadius: '12px',
            padding: '12px 16px',
            // 좁은 화면에서도 잘리지 않게 화면 폭 안에서 줄바꿈한다.
            maxWidth: 'min(420px, calc(100vw - 32px))',
            // 한국어는 어절 단위로 줄바꿈하고, 긴 URL처럼 한 덩어리가 넘칠 때만 중간에서 끊는다.
            wordBreak: 'keep-all',
            overflowWrap: 'anywhere',
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

        states.forEach(({ todoId, state, version }) => {
          if (!todoId || !state) return
          useTimerStore.getState().applyRemoteState(todoId, state, version)
        })
      })
      .catch(() => {})
  }, [initialized, userId])
}
