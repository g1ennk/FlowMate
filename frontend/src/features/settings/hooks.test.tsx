import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import type { PropsWithChildren } from 'react'
import { describe, expect, it } from 'vitest'
import { server } from '../../mocks/server'
import { createTestQueryClient } from '../../test/renderApp'
import { useUpdatePomodoroSettings } from './hooks'

describe('useUpdatePomodoroSettings', () => {
  it('does not send a request when settings have not been loaded', async () => {
    const queryClient = createTestQueryClient()
    let putCount = 0
    server.use(
      http.put('/api/settings/pomodoro-session', async ({ request }) => {
        putCount += 1
        return HttpResponse.json(await request.json())
      }),
      http.put('/api/settings/automation', async ({ request }) => {
        putCount += 1
        return HttpResponse.json(await request.json())
      }),
    )

    function Wrapper({ children }: PropsWithChildren) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    }

    const { result } = renderHook(() => useUpdatePomodoroSettings(), { wrapper: Wrapper })

    act(() => {
      result.current.mutate({ flowMin: 50 })
    })

    await waitFor(() => expect(result.current.isIdle).toBe(false))
    await waitFor(() => expect(result.current.isPending).toBe(false))

    expect(result.current.isError).toBe(true)
    expect(putCount).toBe(0)
  })
})
