import type { PropsWithChildren } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AiReport } from '../../../api/aiReport'
import { server } from '../../../mocks/server'
import { useAuthStore } from '../../../store/authStore'
import { createTestQueryClient } from '../../../test/renderApp'
import { useAiReportSheet } from './useAiReportSheet'

const REPORT: AiReport = {
  id: 'report-1',
  type: 'DAILY',
  periodStart: '2026-10-19',
  keep: '잘한 점',
  problem: '아쉬운 점',
  try: '시도',
  referenceQuestion: null,
  promptVersion: null,
  createdAt: '2026-10-19T10:00:00Z',
}

const initialAuthStore = useAuthStore.getState()

function renderSheetHook() {
  const queryClient = createTestQueryClient()
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return renderHook(() => useAiReportSheet('daily', '2026-10-19', 1, 1), { wrapper })
}

describe('useAiReportSheet', () => {
  beforeEach(() => {
    useAuthStore.setState({
      initialized: true,
      state: {
        type: 'member',
        accessToken: 'member-token',
        user: { id: 'user-1', email: null, nickname: 'Glenn' },
      },
    })
  })

  afterEach(() => {
    useAuthStore.setState(initialAuthStore, true)
  })

  it('처음 생성할 때 결과를 기다리지 않고 시트를 바로 연다', async () => {
    server.use(
      http.get('/api/ai/report', () => new HttpResponse(null, { status: 204 })),
      http.post('/api/ai/report/generate', () => new Promise<Response>(() => {})),
    )
    const { result } = renderSheetHook()

    act(() => { void result.current.requestAiReport() })

    await waitFor(() => expect(result.current.isAiLoading).toBe(true))
    expect(result.current.isSheetOpen).toBe(true)
  })

  it('생성이 503으로 실패하면 시트 안에 다시 시도 안내를 남긴다', async () => {
    server.use(
      http.get('/api/ai/report', () => new HttpResponse(null, { status: 204 })),
      http.post('/api/ai/report/generate', () =>
        HttpResponse.json({ error: { message: 'busy' } }, { status: 503 }),
      ),
    )
    const { result } = renderSheetHook()

    await act(async () => { await result.current.requestAiReport() })

    expect(result.current.isSheetOpen).toBe(true)
    expect(result.current.aiError).toBe('잠시 후 다시 시도해 주세요')
  })

  it('다시 생성 실패 문구는 시트를 닫았다 열면 지운다', async () => {
    let fail = false
    server.use(
      http.get('/api/ai/report', () => HttpResponse.json(REPORT)),
      http.post('/api/ai/report/generate', () =>
        fail
          ? HttpResponse.json({ error: { message: 'boom' } }, { status: 500 })
          : HttpResponse.json(REPORT),
      ),
    )
    const { result } = renderSheetHook()

    await act(async () => { await result.current.requestAiReport() })
    fail = true
    await act(async () => { await result.current.handleRegenerate() })
    expect(result.current.aiError).not.toBeNull()

    act(() => result.current.closeSheet())
    await act(async () => { await result.current.requestAiReport() })

    expect(result.current.isSheetOpen).toBe(true)
    expect(result.current.aiError).toBeNull()
  })
})
