import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { delay, http, HttpResponse } from 'msw'
import { toast, Toaster } from 'react-hot-toast'
import { Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { queryKeys } from '../../lib/queryKeys'
import { storageKeys } from '../../lib/storageKeys'
import { server } from '../../mocks/server'
import { useAuthStore } from '../../store/authStore'
import { renderApp } from '../../test/renderApp'
import { initialSingleTimerState, useTimerStore } from '../timer/timerStore'
import { resetPendingDeletes } from './pendingDeletes'
import TodosPage from './TodosPage'

const selectedDateKey = '2026-01-09'
const initialAuthStore = useAuthStore.getState()

let todoIdSequence = 0

function nextTodoId() {
  todoIdSequence += 1
  return `00000000-0000-4000-8000-${String(todoIdSequence).padStart(12, '0')}`
}

function buildTodo(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: nextTodoId(),
    title: '기존 할 일',
    note: null,
    date: selectedDateKey,
    miniDay: 0,
    dayOrder: 0,
    isDone: false,
    sessionCount: 0,
    sessionFocusSeconds: 0,
    timerMode: null,
    createdAt: '2026-01-09T00:00:00.000Z',
    updatedAt: '2026-01-09T00:00:00.000Z',
    ...overrides,
  }
}

function seedTodos(items: Array<Record<string, unknown>>) {
  window.localStorage.setItem(storageKeys.todos('local'), JSON.stringify(items))
}

function readStoredTodos() {
  return JSON.parse(window.localStorage.getItem(storageKeys.todos('local')) ?? '[]') as Array<
    Record<string, unknown>
  >
}



function seedCalendarViewMode(mode: string) {
  window.localStorage.setItem(storageKeys.todosCalendarViewMode, mode)
}

function setGuestAuth() {
  useAuthStore.setState({
    initialized: true,
    state: {
      type: 'guest',
      token: 'guest-token',
    },
  })
}

async function flushTodosPage() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(700)
  })
}

async function renderTodosPage({
  routeDateKey = selectedDateKey,
  items = [],
  now = new Date(2026, 0, 9, 9, 0, 0),
}: {
  routeDateKey?: string
  items?: Array<Record<string, unknown>>
  now?: Date
} = {}) {
  vi.setSystemTime(now)
  seedTodos(items)

  const result = renderApp(
    <Routes>
      <Route path="/todos" element={<TodosPage />} />
    </Routes>,
    { route: `/todos?date=${routeDateKey}` },
  )

  await flushTodosPage()
  return result
}

function getSectionToggleButton(sectionTitle: string, action: '펼치기' | '접기') {
  return screen.getByRole('button', { name: `${sectionTitle} 섹션 ${action}` })
}

function expectSectionExpanded(sectionTitle: string) {
  expect(getSectionToggleButton(sectionTitle, '접기')).toHaveAttribute('aria-expanded', 'true')
}

function expectSectionCollapsed(sectionTitle: string) {
  expect(getSectionToggleButton(sectionTitle, '펼치기')).toHaveAttribute('aria-expanded', 'false')
}

describe('TodosPage', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    todoIdSequence = 0
    window.localStorage.clear()
    useAuthStore.setState(initialAuthStore, true)
    setGuestAuth()
    useTimerStore.setState({ timers: {}, pendingAutoSessions: {} })
  })

  afterEach(() => {
    resetPendingDeletes()
    vi.useRealTimers()
    window.localStorage.clear()
    useAuthStore.setState(initialAuthStore, true)
    useTimerStore.setState({ timers: {}, pendingAutoSessions: {} })
    vi.restoreAllMocks()
  })

  it('opens only the current mini-day section for today', async () => {
    await renderTodosPage({
      routeDateKey: selectedDateKey,
      now: new Date(2026, 0, 9, 9, 0, 0),
      items: [
        buildTodo({ title: '미분류 할 일', miniDay: 0 }),
        buildTodo({ title: '오전 할 일', miniDay: 1 }),
        buildTodo({ title: '오후 할 일', miniDay: 2 }),
      ],
    })

    expect(screen.getByText('1월 9일')).toBeInTheDocument()
    expectSectionCollapsed('미분류')
    expectSectionExpanded('오전')
    expectSectionCollapsed('오후')
    expectSectionCollapsed('저녁')
    expect(screen.getByText('오전 할 일')).toBeInTheDocument()
    expect(screen.queryByText('미분류 할 일')).not.toBeInTheDocument()
    expect(screen.queryByText('오후 할 일')).not.toBeInTheDocument()
  })

  it('defaults the calendar to week view on the todos page', async () => {
    await renderTodosPage({
      routeDateKey: selectedDateKey,
      now: new Date(2026, 0, 9, 9, 0, 0),
      items: [],
    })

    expect(screen.getByRole('button', { name: '주 보기' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '월 보기' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('restores the last selected calendar view mode from local storage', async () => {
    seedCalendarViewMode('month')

    await renderTodosPage({
      routeDateKey: selectedDateKey,
      now: new Date(2026, 0, 9, 9, 0, 0),
      items: [],
    })

    expect(screen.getByRole('button', { name: '월 보기' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '주 보기' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('persists the selected calendar view mode across remounts', async () => {
    const rendered = await renderTodosPage({
      routeDateKey: selectedDateKey,
      now: new Date(2026, 0, 9, 9, 0, 0),
      items: [],
    })

    fireEvent.click(screen.getByRole('button', { name: '월 보기' }))

    expect(window.localStorage.getItem(storageKeys.todosCalendarViewMode)).toBe('month')
    expect(screen.getByRole('button', { name: '월 보기' })).toHaveAttribute('aria-pressed', 'true')

    rendered.unmount()

    await renderTodosPage({
      routeDateKey: selectedDateKey,
      now: new Date(2026, 0, 9, 9, 0, 0),
      items: [],
    })

    expect(screen.getByRole('button', { name: '월 보기' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '주 보기' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('keeps all sections collapsed for today when the current time is outside mini-day ranges', async () => {
    await renderTodosPage({
      routeDateKey: selectedDateKey,
      now: new Date(2026, 0, 9, 2, 0, 0),
      items: [
        buildTodo({ title: '미분류 할 일', miniDay: 0 }),
        buildTodo({ title: '오전 할 일', miniDay: 1 }),
      ],
    })

    expectSectionCollapsed('미분류')
    expectSectionCollapsed('오전')
    expectSectionCollapsed('오후')
    expectSectionCollapsed('저녁')
    expect(screen.queryByText('미분류 할 일')).not.toBeInTheDocument()
    expect(screen.queryByText('오전 할 일')).not.toBeInTheDocument()
  })

  it('opens only populated sections for past dates', async () => {
    await renderTodosPage({
      routeDateKey: selectedDateKey,
      now: new Date(2026, 0, 15, 9, 0, 0),
      items: [
        buildTodo({ title: '과거 오전 할 일', miniDay: 1 }),
        buildTodo({ title: '과거 저녁 할 일', miniDay: 3, date: selectedDateKey }),
        buildTodo({ title: '다른 날짜 할 일', miniDay: 2, date: '2026-01-10' }),
      ],
    })

    expectSectionCollapsed('미분류')
    expectSectionExpanded('오전')
    expectSectionCollapsed('오후')
    expectSectionExpanded('저녁')
    expect(screen.getByText('과거 오전 할 일')).toBeInTheDocument()
    expect(screen.getByText('과거 저녁 할 일')).toBeInTheDocument()
    expect(screen.queryByText('다른 날짜 할 일')).not.toBeInTheDocument()
  })

  it('opens only populated sections for future dates', async () => {
    await renderTodosPage({
      routeDateKey: '2026-01-11',
      now: new Date(2026, 0, 9, 9, 0, 0),
      items: [
        buildTodo({ title: '미래 오후 할 일', miniDay: 2, date: '2026-01-11' }),
        buildTodo({ title: '다른 날짜 할 일', miniDay: 1, date: '2026-01-12' }),
      ],
    })

    expectSectionCollapsed('미분류')
    expectSectionCollapsed('오전')
    expectSectionExpanded('오후')
    expectSectionCollapsed('저녁')
    expect(screen.getByText('미래 오후 할 일')).toBeInTheDocument()
    expect(screen.queryByText('다른 날짜 할 일')).not.toBeInTheDocument()
  })

  it('keeps all sections collapsed for empty future dates', async () => {
    await renderTodosPage({
      routeDateKey: '2026-01-12',
      now: new Date(2026, 0, 9, 9, 0, 0),
      items: [buildTodo({ title: '다른 날짜 할 일', miniDay: 1, date: '2026-01-11' })],
    })

    expectSectionCollapsed('미분류')
    expectSectionCollapsed('오전')
    expectSectionCollapsed('오후')
    expectSectionCollapsed('저녁')
    expect(screen.queryByText('다른 날짜 할 일')).not.toBeInTheDocument()
  })

  it('reinitializes section state when the selected date changes', async () => {
    await renderTodosPage({
      routeDateKey: '2026-01-10',
      now: new Date(2026, 0, 15, 9, 0, 0),
      items: [
        buildTodo({ title: '1월 10일 오전 할 일', miniDay: 1, date: '2026-01-10' }),
        buildTodo({ title: '1월 11일 오후 할 일', miniDay: 2, date: '2026-01-11' }),
      ],
    })

    expect(screen.getByText('1월 10일')).toBeInTheDocument()
    expect(screen.getByText('1월 10일 오전 할 일')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^11\b/ }))

    expect(screen.getByText('1월 11일')).toBeInTheDocument()
    expect(screen.getByText('1월 11일 오후 할 일')).toBeInTheDocument()
    expect(screen.queryByText('1월 10일 오전 할 일')).not.toBeInTheDocument()
    expectSectionCollapsed('미분류')
    expectSectionCollapsed('오전')
    expectSectionExpanded('오후')
  })

  it('shows move actions for incomplete todos and duplicate actions for completed todos', async () => {
    await renderTodosPage({
      routeDateKey: '2026-01-08',
      now: new Date(2026, 0, 9, 9, 0, 0),
      items: [
        buildTodo({ title: '과거 미완료', date: '2026-01-08', isDone: false }),
        buildTodo({ title: '과거 완료', date: '2026-01-08', isDone: true }),
      ],
    })

    fireEvent.click(screen.getByText('과거 미완료'))
    expect(screen.getByRole('button', { name: '오늘하기' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '날짜 바꾸기' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '다른 날 또 하기' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('과거 완료'))
    expect(screen.getByRole('button', { name: '오늘 또 하기' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다른 날 또 하기' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '날짜 바꾸기' })).toBeInTheDocument()
  })

  it('shows 내일 하기 for today incomplete todos and 내일 또 하기 for today completed todos', async () => {
    await renderTodosPage({
      routeDateKey: selectedDateKey,
      now: new Date(2026, 0, 9, 9, 0, 0),
      items: [
        buildTodo({ title: '오늘 미완료', miniDay: 0, isDone: false }),
        buildTodo({ title: '오늘 완료', miniDay: 0, isDone: true }),
      ],
    })

    fireEvent.click(getSectionToggleButton('미분류', '펼치기'))
    fireEvent.click(screen.getByText('오늘 미완료'))
    expect(screen.getByRole('button', { name: '내일 하기' })).toBeInTheDocument()

    fireEvent.click(screen.getByText('오늘 완료'))
    expect(screen.getByRole('button', { name: '내일 또 하기' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다른 날 또 하기' })).toBeInTheDocument()
  })

  it('disables move date confirmation for the same date and allows duplicate date confirmation', async () => {
    await renderTodosPage({
      routeDateKey: selectedDateKey,
      now: new Date(2026, 0, 9, 9, 0, 0),
      items: [
        buildTodo({ title: '같은 날 이동', miniDay: 0, isDone: false }),
        buildTodo({ title: '같은 날 복제', miniDay: 0, isDone: true }),
      ],
    })

    fireEvent.click(getSectionToggleButton('미분류', '펼치기'))

    fireEvent.click(screen.getByText('같은 날 이동'))
    fireEvent.click(screen.getByRole('button', { name: '날짜 바꾸기' }))
    expect(within(screen.getByRole('button', { name: '2026-01-09 선택' })).getByText('오늘')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '이 날짜로 이동' })).toBeDisabled()
    fireEvent.keyDown(document, { key: 'Escape' })

    fireEvent.click(screen.getByText('같은 날 복제'))
    fireEvent.click(screen.getByRole('button', { name: '다른 날 또 하기' }))
    expect(screen.getByRole('button', { name: '새로 추가' })).not.toBeDisabled()
  })

  it('moves incomplete todos to today while preserving miniDay and recalculating dayOrder', async () => {
    await renderTodosPage({
      routeDateKey: '2026-01-08',
      now: new Date(2026, 0, 9, 9, 0, 0),
      items: [
        buildTodo({ title: '오늘 기존 할 일', date: '2026-01-09', miniDay: 2, dayOrder: 0 }),
        buildTodo({ title: '이동할 할 일', date: '2026-01-08', miniDay: 2, dayOrder: 0 }),
      ],
    })

    fireEvent.click(screen.getByText('이동할 할 일'))
    fireEvent.click(screen.getByRole('button', { name: '오늘하기' }))
    await flushTodosPage()

    const movedTodo = readStoredTodos().find((todo) => todo.title === '이동할 할 일')
    expect(movedTodo).toMatchObject({
      date: '2026-01-09',
      miniDay: 2,
      dayOrder: 1,
      isDone: false,
    })
  })

  it('duplicates completed todos into uncategorized active todos', async () => {
    await renderTodosPage({
      routeDateKey: '2026-01-08',
      now: new Date(2026, 0, 9, 9, 0, 0),
      items: [
        buildTodo({ title: '오늘 미분류 기존 할 일', date: '2026-01-09', miniDay: 0, dayOrder: 0 }),
        buildTodo({
          title: '다시 할 완료 태스크',
          date: '2026-01-08',
          miniDay: 2,
          dayOrder: 0,
          isDone: true,
          note: '메모 복사',
          sessionCount: 2,
          sessionFocusSeconds: 1800,
          timerMode: 'pomodoro',
        }),
      ],
    })

    fireEvent.click(screen.getByText('다시 할 완료 태스크'))
    fireEvent.click(screen.getByRole('button', { name: '오늘 또 하기' }))
    await flushTodosPage()

    const storedTodos = readStoredTodos()
    const duplicatedTodo = storedTodos.find(
      (todo) => todo.title === '다시 할 완료 태스크' && todo.date === '2026-01-09' && todo.isDone === false,
    )

    expect(duplicatedTodo).toMatchObject({
      title: '다시 할 완료 태스크',
      note: '메모 복사',
      date: '2026-01-09',
      miniDay: 0,
      dayOrder: 1,
      isDone: false,
      sessionCount: 0,
      sessionFocusSeconds: 0,
      timerMode: null,
    })
  })

  it('renders, creates, completes, and deletes todos in the main flow', async () => {
    await renderTodosPage({
      routeDateKey: selectedDateKey,
      now: new Date(2026, 0, 9, 2, 0, 0),
      items: [buildTodo({ title: '기존 할 일', miniDay: 0 })],
    })

    expect(screen.getByText('1월 9일')).toBeInTheDocument()
    expectSectionCollapsed('미분류')
    expect(screen.queryByText('기존 할 일')).not.toBeInTheDocument()

    fireEvent.click(getSectionToggleButton('미분류', '펼치기'))
    expect(screen.getByText('기존 할 일')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('미분류 할 일 추가'))
    const todoInput = screen.getByPlaceholderText('할 일을 입력하세요')
    fireEvent.change(todoInput, { target: { value: '새 할 일' } })
    fireEvent.blur(todoInput)
    await flushTodosPage()

    expect(screen.getByText('새 할 일')).toBeInTheDocument()
    expect(screen.getByText('남음 2 · 완료 0')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '새 할 일 완료' }))
    await flushTodosPage()

    expect(screen.getByText('남음 1 · 완료 1')).toBeInTheDocument()

    fireEvent.click(screen.getByText('기존 할 일'))
    fireEvent.click(screen.getByRole('button', { name: '삭제하기' }))
    await flushTodosPage()

    expect(screen.queryByText('기존 할 일')).not.toBeInTheDocument()
  })
})

describe('TodosPage delete undo', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    todoIdSequence = 0
    window.localStorage.clear()
    useAuthStore.setState(initialAuthStore, true)
    setGuestAuth()
    useTimerStore.setState({ timers: {}, pendingAutoSessions: {} })
    render(<Toaster />)
  })

  afterEach(() => {
    resetPendingDeletes()
    act(() => {
      toast.remove()
    })
    vi.useRealTimers()
    window.localStorage.clear()
    useAuthStore.setState(initialAuthStore, true)
    useTimerStore.setState({ timers: {}, pendingAutoSessions: {} })
    vi.restoreAllMocks()
  })

  async function renderWithTodos(titles: string[]) {
    const items = titles.map((title, index) => buildTodo({ title, dayOrder: index }))
    const result = await renderTodosPage({
      now: new Date(2026, 0, 9, 2, 0, 0),
      items,
    })
    fireEvent.click(getSectionToggleButton('미분류', '펼치기'))
    return { ...result, items }
  }

  async function wait(ms: number) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms)
    })
  }

  function batchDelete(titles: string[]) {
    fireEvent.click(screen.getByRole('button', { name: '선택' }))
    for (const title of titles) {
      fireEvent.click(screen.getByRole('button', { name: `${title} 선택` }))
    }
    fireEvent.click(screen.getByRole('button', { name: '삭제' }))
  }

  function deleteOne(title: string) {
    fireEvent.click(screen.getByText(title))
    fireEvent.click(screen.getByRole('button', { name: '삭제하기' }))
  }

  function storedTitles() {
    return readStoredTodos().map((todo) => todo.title)
  }

  it('deletes every batch on the server when two batches are deleted within 5 seconds', async () => {
    await renderWithTodos(['할 일 A', '할 일 B', '할 일 C'])
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    batchDelete(['할 일 A', '할 일 B'])
    await wait(2000)
    batchDelete(['할 일 C'])
    await wait(6000)

    expect(storedTitles()).toEqual([])
    // keepalive 는 백그라운드 확정에만 쓴다 (교차 출처 preflight 와 겹치면 거부하는 브라우저가 있다).
    const deleteCalls = fetchSpy.mock.calls.filter(([, init]) => init?.method === 'DELETE')
    expect(deleteCalls).toHaveLength(3)
    expect(deleteCalls.every(([, init]) => !init?.keepalive)).toBe(true)
  })

  it('undoes only the latest batch while the earlier batch is still deleted', async () => {
    await renderWithTodos(['할 일 A', '할 일 B', '할 일 C'])

    batchDelete(['할 일 A', '할 일 B'])
    await wait(2000)
    batchDelete(['할 일 C'])
    await wait(100)

    const undoToast = screen.getByText('1개 삭제됨').closest('span') as HTMLElement
    fireEvent.click(within(undoToast).getByRole('button', { name: '되돌리기' }))
    await wait(6000)

    expect(storedTitles()).toEqual(['할 일 C'])
    expect(screen.getAllByText('할 일 C')).toHaveLength(1)
    expect(screen.queryByText('할 일 A')).not.toBeInTheDocument()
  })

  it('keeps a pending deleted todo hidden across refetch and restores it once on undo', async () => {
    const { queryClient } = await renderWithTodos(['할 일 A', '할 일 B'])

    deleteOne('할 일 A')
    await wait(100)
    expect(screen.queryByText('할 일 A')).not.toBeInTheDocument()

    // 다른 mutation 의 invalidate, 창 포커스, 당겨서 새로고침과 같은 refetch
    void queryClient.invalidateQueries({ queryKey: queryKeys.todos() })
    await wait(700)
    expect(screen.queryByText('할 일 A')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '되돌리기' }))
    await wait(700)
    expect(screen.getAllByText('할 일 A')).toHaveLength(1)

    await wait(6000)
    expect(storedTitles()).toEqual(['할 일 A', '할 일 B'])
    expect(screen.getAllByText('할 일 A')).toHaveLength(1)
  })

  it('commits pending deletes and closes the undo toast when leaving the page', async () => {
    const { unmount } = await renderWithTodos(['할 일 A', '할 일 B'])

    deleteOne('할 일 A')
    await wait(100)
    expect(screen.getByRole('button', { name: '되돌리기' })).toBeInTheDocument()

    unmount()
    await wait(1500)

    expect(storedTitles()).toEqual(['할 일 B'])
    expect(screen.queryByRole('button', { name: '되돌리기' })).not.toBeInTheDocument()
  })

  it('keeps the timer and unsynced sessions when a delete is undone', async () => {
    const { items } = await renderWithTodos(['할 일 A'])
    const todoId = items[0].id as string
    act(() => {
      useTimerStore.setState({
        timers: {
          [todoId]: {
            ...initialSingleTimerState,
            mode: 'stopwatch',
            status: 'running',
            flexiblePhase: 'focus',
            focusStartedAt: Date.now(),
            startedAt: Date.now(),
          },
        },
        pendingAutoSessions: {
          [todoId]: [{ sessionFocusSeconds: 600, breakSeconds: 0, clientSessionId: 'pending-1' }],
        },
      })
    })

    deleteOne('할 일 A')
    await wait(100)

    // 유예 중에는 흐르던 타이머만 멈춘다.
    expect(useTimerStore.getState().timers[todoId]?.status).toBe('paused')

    fireEvent.click(screen.getByRole('button', { name: '되돌리기' }))
    await wait(6000)

    // 삭제 때문에 멈춘 타이머는 되돌리면 다시 흐른다.
    expect(useTimerStore.getState().timers[todoId]?.status).toBe('running')
    expect(useTimerStore.getState().pendingAutoSessions[todoId]).toHaveLength(1)
  })

  it('keeps a pending deleted todo hidden when another optimistic update rolls back', async () => {
    await renderWithTodos(['할 일 A', '할 일 B'])
    server.use(
      http.patch('/api/todos/:id', async () => {
        await delay(200)
        return HttpResponse.json({ error: { message: 'boom' } }, { status: 500 })
      }),
    )

    // A 완료 PATCH 의 롤백 스냅샷에 B 가 들어간 뒤 B 를 지운다.
    fireEvent.click(screen.getByRole('button', { name: '할 일 A 완료' }))
    await wait(10)
    deleteOne('할 일 B')
    await wait(250)

    expect(screen.queryByText('할 일 B')).not.toBeInTheDocument()
  })

  it('commits pending deletes with keepalive when the app goes to the background', async () => {
    await renderWithTodos(['할 일 A', '할 일 B'])
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    deleteOne('할 일 A')
    await wait(100)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await wait(1500)

    expect(storedTitles()).toEqual(['할 일 B'])
    expect(screen.queryByRole('button', { name: '되돌리기' })).not.toBeInTheDocument()
    const deleteCall = fetchSpy.mock.calls.find(([, init]) => init?.method === 'DELETE')
    expect(deleteCall?.[1]?.keepalive).toBe(true)
  })

  it('clears the timer and unsynced sessions once the delete is committed', async () => {
    const { items } = await renderWithTodos(['할 일 A'])
    const todoId = items[0].id as string
    act(() => {
      useTimerStore.setState({
        timers: { [todoId]: { ...initialSingleTimerState, status: 'paused' } },
        pendingAutoSessions: {
          [todoId]: [{ sessionFocusSeconds: 600, breakSeconds: 0, clientSessionId: 'pending-1' }],
        },
      })
    })

    deleteOne('할 일 A')
    await wait(6000)

    expect(storedTitles()).toEqual([])
    expect(useTimerStore.getState().timers[todoId]).toBeUndefined()
    expect(useTimerStore.getState().pendingAutoSessions[todoId]).toBeUndefined()
  })

  it('shows an error and brings the todo back when the delete request fails', async () => {
    await renderWithTodos(['할 일 A'])
    server.use(
      http.delete('/api/todos/:id', () =>
        HttpResponse.json({ error: { message: 'boom' } }, { status: 500 }),
      ),
    )

    deleteOne('할 일 A')
    await wait(6000)

    expect(screen.getByText('삭제하지 못했어요. 다시 시도해 주세요')).toBeInTheDocument()
    expect(screen.getByText('할 일 A')).toBeInTheDocument()
  })
})

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname + location.search}</output>
}

describe('TodosPage ordering, editing and date flow', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    todoIdSequence = 0
    window.localStorage.clear()
    useAuthStore.setState(initialAuthStore, true)
    setGuestAuth()
    useTimerStore.setState({ timers: {}, pendingAutoSessions: {} })
    render(<Toaster />)
  })

  afterEach(() => {
    resetPendingDeletes()
    act(() => {
      toast.remove()
    })
    vi.useRealTimers()
    window.localStorage.clear()
    useAuthStore.setState(initialAuthStore, true)
    useTimerStore.setState({ timers: {}, pendingAutoSessions: {} })
    vi.restoreAllMocks()
  })

  async function wait(ms: number) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms)
    })
  }

  async function renderPage({
    route = `/todos?date=${selectedDateKey}`,
    items = [],
    now = new Date(2026, 0, 9, 2, 0, 0),
  }: {
    route?: string
    items?: Array<Record<string, unknown>>
    now?: Date
  } = {}) {
    vi.setSystemTime(now)
    seedTodos(items)
    const result = renderApp(
      <Routes>
        <Route
          path="/todos"
          element={
            <>
              <TodosPage />
              <LocationProbe />
            </>
          }
        />
      </Routes>,
      { route },
    )
    await wait(700)
    return result
  }

  function visibleTodoTitles() {
    return screen
      .getAllByRole('button', { name: / 완료( 취소)?$/ })
      .map((button) => (button.getAttribute('aria-label') ?? '').replace(/ 완료( 취소)?$/, ''))
  }

  function openUncategorizedInput() {
    fireEvent.click(screen.getByLabelText('미분류 할 일 추가'))
    return screen.getByPlaceholderText('할 일을 입력하세요') as HTMLTextAreaElement
  }

  function startEditing(title: string) {
    fireEvent.click(screen.getByText(title))
    fireEvent.click(screen.getByRole('button', { name: '수정하기' }))
    return screen.getByDisplayValue(title) as HTMLTextAreaElement
  }

  function countRequests(fetchSpy: { mock: { calls: unknown[][] } }, method: string) {
    return fetchSpy.mock.calls.filter((call) => (call[1] as RequestInit | undefined)?.method === method).length
  }

  it('adds a new todo at the end even when server dayOrders are sparse', async () => {
    await renderPage({
      items: [
        buildTodo({ title: '할 일 A', dayOrder: 5 }),
        buildTodo({ title: '할 일 B', dayOrder: 7 }),
      ],
    })
    fireEvent.click(getSectionToggleButton('미분류', '펼치기'))

    const input = openUncategorizedInput()
    fireEvent.change(input, { target: { value: '새 할 일' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await wait(700)

    expect(visibleTodoTitles()).toEqual(['할 일 A', '할 일 B', '새 할 일'])
  })

  it('moves an uncompleted todo to the end of the active list', async () => {
    await renderPage({
      items: [
        buildTodo({ title: '할 일 A', dayOrder: 5 }),
        buildTodo({ title: '할 일 B', dayOrder: 7 }),
        buildTodo({ title: '끝낸 일', dayOrder: 0, isDone: true }),
      ],
    })
    fireEvent.click(getSectionToggleButton('미분류', '펼치기'))

    fireEvent.click(screen.getByRole('button', { name: '끝낸 일 완료 취소' }))
    await wait(700)

    expect(visibleTodoTitles()).toEqual(['할 일 A', '할 일 B', '끝낸 일'])
  })

  it('puts a todo back where it was when completing is undone', async () => {
    await renderPage({
      items: [
        buildTodo({ title: '할 일 A', dayOrder: 0 }),
        buildTodo({ title: '할 일 B', dayOrder: 1 }),
        buildTodo({ title: '할 일 C', dayOrder: 2 }),
        buildTodo({ title: '끝낸 일', dayOrder: 3, isDone: true }),
      ],
    })
    fireEvent.click(getSectionToggleButton('미분류', '펼치기'))

    fireEvent.click(screen.getByRole('button', { name: '할 일 A 완료' }))
    await wait(700)
    fireEvent.click(screen.getByRole('button', { name: '되돌리기' }))
    await wait(700)

    expect(visibleTodoTitles()).toEqual(['할 일 A', '할 일 B', '할 일 C', '끝낸 일'])
  })

  it('clears the input right away so the next todo can be typed while saving', async () => {
    await renderPage()
    fireEvent.click(getSectionToggleButton('미분류', '펼치기'))

    const input = openUncategorizedInput()
    fireEvent.change(input, { target: { value: '  첫째  ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(input.value).toBe('')

    fireEvent.change(input, { target: { value: '둘째' } })
    await wait(700)

    // 첫 할 일이 목록에 나타나도 같은 입력창이 유지되어야 한다.
    expect(screen.getByPlaceholderText('할 일을 입력하세요')).toHaveValue('둘째')
    expect(screen.getByText('첫째')).toBeInTheDocument()
    expect(readStoredTodos().map((todo) => todo.title)).toEqual(['첫째'])
  })

  it('keeps an empty section open when a todo is added by leaving the input', async () => {
    await renderPage()

    const input = openUncategorizedInput()
    fireEvent.change(input, { target: { value: '나가면서 추가' } })
    fireEvent.blur(input)
    await wait(700)

    expectSectionExpanded('미분류')
    expect(screen.getByText('나가면서 추가')).toBeInTheDocument()
  })

  it('brings the title back with an error when adding fails and the input is still empty', async () => {
    await renderPage()
    server.use(
      http.post('/api/todos', () => HttpResponse.json({ error: { message: 'boom' } }, { status: 500 })),
    )
    fireEvent.click(getSectionToggleButton('미분류', '펼치기'))

    const input = openUncategorizedInput()
    fireEvent.change(input, { target: { value: '첫째' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await wait(700)

    expect(input.value).toBe('첫째')
    expect(screen.getByText('할 일을 추가하지 못했어요. 다시 시도해 주세요')).toBeInTheDocument()
  })

  it('keeps what was typed next when adding the previous todo fails', async () => {
    await renderPage()
    server.use(
      http.post('/api/todos', async () => {
        await delay(200)
        return HttpResponse.json({ error: { message: 'boom' } }, { status: 500 })
      }),
    )
    fireEvent.click(getSectionToggleButton('미분류', '펼치기'))

    const input = openUncategorizedInput()
    fireEvent.change(input, { target: { value: '첫째' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.change(input, { target: { value: '둘째' } })
    await wait(700)

    expect(input.value).toBe('둘째')
  })

  it('ignores Enter while a Korean IME is still composing', async () => {
    await renderPage()
    fireEvent.click(getSectionToggleButton('미분류', '펼치기'))

    const input = openUncategorizedInput()
    fireEvent.change(input, { target: { value: '한글' } })
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
    await wait(700)

    expect(input.value).toBe('한글')
    expect(readStoredTodos()).toEqual([])
  })

  it('leaves editing with the original title when the title is cleared', async () => {
    await renderPage({ items: [buildTodo({ title: '할 일 A' })] })
    fireEvent.click(getSectionToggleButton('미분류', '펼치기'))
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    const textarea = startEditing('할 일 A')
    fireEvent.change(textarea, { target: { value: '   ' } })
    fireEvent.blur(textarea)
    await wait(700)

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.getByText('할 일 A')).toBeInTheDocument()
    expect(countRequests(fetchSpy, 'PATCH')).toBe(0)
  })

  it('does not save or announce an edit when the title did not change', async () => {
    await renderPage({ items: [buildTodo({ title: '할 일 A' })] })
    fireEvent.click(getSectionToggleButton('미분류', '펼치기'))
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    const textarea = startEditing('할 일 A')
    fireEvent.keyDown(textarea, { key: 'Enter' })
    await wait(700)

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(countRequests(fetchSpy, 'PATCH')).toBe(0)
    expect(screen.queryByText('수정됨')).not.toBeInTheDocument()
  })

  it('saves an edit once even when Enter is followed by blur', async () => {
    await renderPage({ items: [buildTodo({ title: '할 일 A' })] })
    fireEvent.click(getSectionToggleButton('미분류', '펼치기'))
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    const textarea = startEditing('할 일 A')
    fireEvent.change(textarea, { target: { value: '고친 할 일' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })
    fireEvent.blur(textarea)
    await wait(700)

    expect(countRequests(fetchSpy, 'PATCH')).toBe(1)
    expect(screen.getByText('고친 할 일')).toBeInTheDocument()
    expect(readStoredTodos()[0]).toMatchObject({ title: '고친 할 일' })
  })

  it('ignores Enter while composing when editing a title', async () => {
    await renderPage({ items: [buildTodo({ title: '할 일 A' })] })
    fireEvent.click(getSectionToggleButton('미분류', '펼치기'))

    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    const textarea = startEditing('할 일 A')
    fireEvent.change(textarea, { target: { value: '할 일 A 고침' } })
    fireEvent.keyDown(textarea, { key: 'Enter', isComposing: true })
    await wait(700)

    expect(screen.getByDisplayValue('할 일 A 고침')).toBeInTheDocument()
    expect(countRequests(fetchSpy, 'PATCH')).toBe(0)
  })

  it('shows an error when saving an edited title fails', async () => {
    await renderPage({ items: [buildTodo({ title: '할 일 A' })] })
    fireEvent.click(getSectionToggleButton('미분류', '펼치기'))
    server.use(
      http.patch('/api/todos/:id', () => HttpResponse.json({ error: { message: 'boom' } }, { status: 500 })),
    )

    const textarea = startEditing('할 일 A')
    fireEvent.change(textarea, { target: { value: '고친 할 일' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })
    await wait(700)

    expect(screen.getByText('수정하지 못했어요. 다시 시도해 주세요')).toBeInTheDocument()
    expect(screen.getByText('할 일 A')).toBeInTheDocument()
  })

})
