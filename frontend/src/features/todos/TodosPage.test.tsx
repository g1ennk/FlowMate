import { act, fireEvent, screen, within } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultMiniDaysSettings } from '../../lib/miniDays'
import { storageKeys } from '../../lib/storageKeys'
import { useAuthStore } from '../../store/authStore'
import { renderApp } from '../../test/renderApp'
import { useTimerStore } from '../timer/timerStore'
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
    reviewRound: null,
    originalTodoId: null,
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

type MiniDaysOverrides = {
  day1?: Partial<(typeof defaultMiniDaysSettings)['day1']>
  day2?: Partial<(typeof defaultMiniDaysSettings)['day2']>
  day3?: Partial<(typeof defaultMiniDaysSettings)['day3']>
}

function seedMiniDaysSettings(overrides: MiniDaysOverrides = {}) {
  window.localStorage.setItem(
    storageKeys.settings('local'),
    JSON.stringify({
      miniDays: {
        day1: { ...defaultMiniDaysSettings.day1, ...(overrides.day1 ?? {}) },
        day2: { ...defaultMiniDaysSettings.day2, ...(overrides.day2 ?? {}) },
        day3: { ...defaultMiniDaysSettings.day3, ...(overrides.day3 ?? {}) },
      },
    }),
  )
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

function setMemberAuth(nickname: string) {
  useAuthStore.setState({
    initialized: true,
    state: {
      type: 'member',
      accessToken: 'member-token',
      user: {
        id: 'user-1',
        email: null,
        nickname,
      },
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

  it('shows a guest greeting for the current mini-day guide on today', async () => {
    await renderTodosPage({
      routeDateKey: selectedDateKey,
      now: new Date(2026, 0, 9, 9, 0, 0),
      items: [],
    })

    expect(screen.getByText('게스트님, 좋은 아침이에요. 오전에 어떤 일부터 시작할까요?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '오전에 추가' })).toBeInTheDocument()
  })

  it('adds 님 to a member nickname in the current mini-day guide', async () => {
    setMemberAuth('김민석')

    await renderTodosPage({
      routeDateKey: selectedDateKey,
      now: new Date(2026, 0, 9, 9, 0, 0),
      items: [],
    })

    expect(screen.getByText('김민석님, 좋은 아침이에요. 오전에 어떤 일부터 시작할까요?')).toBeInTheDocument()
  })

  it('does not duplicate 님 in the current mini-day guide', async () => {
    setMemberAuth('김민석님')

    await renderTodosPage({
      routeDateKey: selectedDateKey,
      now: new Date(2026, 0, 9, 9, 0, 0),
      items: [],
    })

    expect(screen.getByText('김민석님, 좋은 아침이에요. 오전에 어떤 일부터 시작할까요?')).toBeInTheDocument()
    expect(
      screen.queryByText('김민석님님, 좋은 아침이에요. 오전에 어떤 일부터 시작할까요?'),
    ).not.toBeInTheDocument()
  })

  it('uses the configured mini-day label in the personalized guide', async () => {
    seedMiniDaysSettings({
      day1: { label: '집중' },
    })

    await renderTodosPage({
      routeDateKey: selectedDateKey,
      now: new Date(2026, 0, 9, 9, 0, 0),
      items: [],
    })

    expect(screen.getByText('게스트님, 좋은 아침이에요. 집중에 어떤 일부터 시작할까요?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '집중에 추가' })).toBeInTheDocument()
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

  it('shows a personalized guide for today uncategorized section', async () => {
    await renderTodosPage({
      routeDateKey: selectedDateKey,
      now: new Date(2026, 0, 9, 2, 0, 0),
      items: [],
    })

    fireEvent.click(getSectionToggleButton('미분류', '펼치기'))

    expect(screen.getByText('게스트님, 떠오른 일을 먼저 적어둘까요?')).toBeInTheDocument()
  })

  it('keeps uncategorized guide neutral for non-today dates', async () => {
    await renderTodosPage({
      routeDateKey: selectedDateKey,
      now: new Date(2026, 0, 15, 9, 0, 0),
      items: [],
    })

    fireEvent.click(getSectionToggleButton('미분류', '펼치기'))

    expect(screen.getByText('떠오른 일을 먼저 적어둘까요?')).toBeInTheDocument()
    expect(screen.queryByText('게스트님, 떠오른 일을 먼저 적어둘까요?')).not.toBeInTheDocument()
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

    fireEvent.click(getSectionToggleButton('미분류', '펼치기'))
    expect(screen.getByText('떠오른 일을 먼저 적어둘까요?')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^11\b/ }))

    expect(screen.getByText('1월 11일')).toBeInTheDocument()
    expect(screen.getByText('1월 11일 오후 할 일')).toBeInTheDocument()
    expect(screen.queryByText('1월 10일 오전 할 일')).not.toBeInTheDocument()
    expect(screen.queryByText('떠오른 일을 먼저 적어둘까요?')).not.toBeInTheDocument()
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
    expect(screen.queryByRole('button', { name: '복습하기' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('과거 완료'))
    expect(screen.getByRole('button', { name: '복습하기' })).toBeInTheDocument()
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
    expect(screen.getByRole('button', { name: '복습하기' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '내일 또 하기' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다른 날 또 하기' })).toBeInTheDocument()
  })

  it('hides 복습하기 for completed sixth review todos', async () => {
    await renderTodosPage({
      routeDateKey: selectedDateKey,
      now: new Date(2026, 0, 9, 9, 0, 0),
      items: [
        buildTodo({
          title: '[복습 6회] 마지막 복습',
          miniDay: 0,
          isDone: true,
          reviewRound: 6,
          originalTodoId: '00000000-0000-4000-8000-999999999999',
        }),
      ],
    })

    fireEvent.click(getSectionToggleButton('미분류', '펼치기'))
    expect(screen.getByText('[복습 6회] 마지막 복습')).toBeInTheDocument()
    expect(screen.getByText('복습 완료')).toBeInTheDocument()
    expect(screen.queryByText('복습 6회')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('[복습 6회] 마지막 복습'))

    expect(screen.queryByRole('button', { name: '복습하기' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '내일 또 하기' })).toBeInTheDocument()
  })

  it('keeps 복습 6회 badge for incomplete sixth review todos', async () => {
    await renderTodosPage({
      routeDateKey: selectedDateKey,
      now: new Date(2026, 0, 9, 9, 0, 0),
      items: [
        buildTodo({
          title: '[복습 6회] 마지막 복습',
          miniDay: 0,
          isDone: false,
          reviewRound: 6,
          originalTodoId: '00000000-0000-4000-8000-999999999999',
        }),
      ],
    })

    fireEvent.click(getSectionToggleButton('미분류', '펼치기'))

    expect(screen.getByText('[복습 6회] 마지막 복습')).toBeInTheDocument()
    expect(screen.getByText('복습 6회')).toBeInTheDocument()
    expect(screen.queryByText('복습 완료')).not.toBeInTheDocument()
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

  it('schedules completed todos into future uncategorized review todos', async () => {
    const originalTodoId = nextTodoId()

    await renderTodosPage({
      routeDateKey: '2026-01-08',
      now: new Date(2026, 0, 20, 9, 0, 0),
      items: [
        buildTodo({ title: '해당 날짜 기존 할 일', date: '2026-01-09', miniDay: 0, dayOrder: 0 }),
        buildTodo({
          id: originalTodoId,
          title: '복습할 완료 태스크',
          date: '2026-01-08',
          miniDay: 2,
          dayOrder: 0,
          isDone: true,
          note: '복습 메모',
          sessionCount: 2,
          sessionFocusSeconds: 1800,
          timerMode: 'pomodoro',
        }),
      ],
    })

    fireEvent.click(screen.getByText('복습할 완료 태스크'))
    fireEvent.click(screen.getByRole('button', { name: '복습하기' }))
    await flushTodosPage()

    const storedTodos = readStoredTodos()
    const reviewTodo = storedTodos.find(
      (todo) =>
        todo.title === '복습할 완료 태스크' &&
        todo.date === '2026-01-09' &&
        todo.isDone === false,
    )

    expect(reviewTodo).toMatchObject({
      title: '복습할 완료 태스크',
      note: '복습 메모',
      date: '2026-01-09',
      miniDay: 0,
      dayOrder: 1,
      isDone: false,
      sessionCount: 0,
      sessionFocusSeconds: 0,
      timerMode: null,
      reviewRound: 1,
      originalTodoId,
    })
  })

  it('does not create duplicate review todos for the same round', async () => {
    const originalTodoId = nextTodoId()

    await renderTodosPage({
      routeDateKey: '2026-01-08',
      now: new Date(2026, 0, 9, 9, 0, 0),
      items: [
        buildTodo({
          id: originalTodoId,
          title: '중복 방지 태스크',
          date: '2026-01-08',
          miniDay: 0,
          isDone: true,
        }),
      ],
    })

    fireEvent.click(screen.getByText('중복 방지 태스크'))
    fireEvent.click(screen.getByRole('button', { name: '복습하기' }))
    await flushTodosPage()

    fireEvent.click(screen.getByText('중복 방지 태스크'))
    fireEvent.click(screen.getByRole('button', { name: '복습하기' }))
    await flushTodosPage()

    const storedTodos = readStoredTodos().filter(
      (todo) =>
        todo.title === '중복 방지 태스크' &&
        todo.originalTodoId === originalTodoId &&
        todo.reviewRound === 1,
    )

    expect(storedTodos).toHaveLength(1)
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
