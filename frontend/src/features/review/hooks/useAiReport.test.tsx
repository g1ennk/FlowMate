import type { PropsWithChildren } from 'react'
import { onlineManager, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import { http } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import { server } from '../../../mocks/server'
import { createTestQueryClient } from '../../../test/renderApp'
import { useAiReportFlow } from './useAiReport'

describe('useAiReportFlow', () => {
  afterEach(() => {
    onlineManager.setOnline(true)
  })

  // 조회가 연결을 기다리면(paused) 시트가 "만드는 중"에 멈춘다. 저장처럼 바로 실패해서 실패 안내와 다시 시도로 간다
  it('오프라인이면 기다리지 않고 바로 실패한다', async () => {
    server.use(http.get('/api/ai/report', () => Response.error()))
    onlineManager.setOnline(false)
    const client = createTestQueryClient()
    const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
    const { result } = renderHook(() => useAiReportFlow('daily', '2026-10-19'), { wrapper })

    await expect(result.current.fetchOrGenerate()).rejects.toBeTruthy()
  })
})
