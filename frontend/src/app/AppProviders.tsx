import type { PropsWithChildren } from 'react'
import { useEffect, useState } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { Toaster } from 'react-hot-toast'
import { queryClient } from './queryClient'
import { startMockWorker } from '../mocks/browser'

const mockEnabled =
  import.meta.env.VITE_USE_MOCK === 'true' || import.meta.env.VITE_USE_MOCK === '1'

export function AppProviders({ children }: PropsWithChildren) {
  const [mockReady, setMockReady] = useState(!mockEnabled)

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
      {children}
      <Toaster position="top-center" />
      {import.meta.env.DEV ? <ReactQueryDevtools buttonPosition="bottom-left" /> : null}
    </QueryClientProvider>
  )
}
