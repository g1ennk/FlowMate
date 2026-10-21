import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { todoApi } from '../../api/todos'
import type { Todo, TodoList } from '../../api/types'
import { queryKeys } from '../../lib/queryKeys'
import { isOptimisticTodo, useCreateTodo } from './hooks'

const SAVED: Todo = {
  id: '11111111-1111-4111-8111-111111111111',
  title: '둘째 할 일',
  note: null,
  date: '2026-10-21',
  miniDay: 0,
  dayOrder: 1,
  isDone: false,
  sessionCount: 0,
  sessionFocusSeconds: 0,
  timerMode: null,
  createdAt: '2026-10-21T00:00:00Z',
  updatedAt: '2026-10-21T00:00:00Z',
}
const PAYLOAD = { title: '둘째 할 일', note: null, date: '2026-10-21', miniDay: 0, dayOrder: 1 }

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  qc.setQueryData<TodoList>(queryKeys.todos(), { items: [] })
  vi.spyOn(todoApi, 'list').mockResolvedValue({ items: [] })
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  const { result } = renderHook(() => useCreateTodo(), { wrapper })
  const items = () => qc.getQueryData<TodoList>(queryKeys.todos())?.items ?? []
  return { result, items }
}

afterEach(() => vi.restoreAllMocks())

describe('useCreateTodo', () => {
  it('저장 응답을 기다리지 않고 바로 목록에 그리고, 응답이 오면 서버 값으로 바꾼다', async () => {
    let resolve!: (todo: Todo) => void
    vi.spyOn(todoApi, 'create').mockReturnValue(new Promise((r) => { resolve = r }))
    const { result, items } = setup()

    act(() => { result.current.mutate(PAYLOAD) })
    await waitFor(() => expect(items()).toHaveLength(1))
    const temp = items()[0]
    expect(temp.title).toBe('둘째 할 일')
    expect(isOptimisticTodo(temp.id)).toBe(true)

    // 응답 뒤 재조회가 덮어쓰기 전에 본다
    vi.spyOn(todoApi, 'list').mockResolvedValue({ items: [SAVED] })
    await act(async () => { resolve(SAVED) })
    await waitFor(() => expect(items()[0].id).toBe(SAVED.id))
    expect(items()).toHaveLength(1)
    expect(isOptimisticTodo(temp.id)).toBe(false)
  })

  it('저장에 실패하면 먼저 그린 행을 빼낸다', async () => {
    vi.spyOn(todoApi, 'create').mockRejectedValue(new Error('fail'))
    const { result, items } = setup()

    await act(async () => { await result.current.mutateAsync(PAYLOAD).catch(() => {}) })
    expect(items()).toHaveLength(0)
  })
})
