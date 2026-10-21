import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { onlineManager } from '@tanstack/react-query'
import { delay, http, HttpResponse } from 'msw'
import { toast, Toaster } from 'react-hot-toast'
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import type { TodoList } from '../../api/types'
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



// 예전 버전은 달력 보기를 기기에 남겼다. 이제는 읽지 않는다
function seedCalendarViewMode(mode: string) {
  window.localStorage.setItem('flowmate/ui/todos-calendar-view-mode', mode)
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

// 할 일이 없는 구간은 제자리에 한 줄 행(제목 h3 안의 버튼, 설명은 시간대)으로 줄인다. 펼치기/접기 화살표는 없다
function expectSectionCompact(sectionTitle: string) {
  expect(screen.queryByRole('button', { name: new RegExp(`^${sectionTitle} 섹션 (펼치기|접기)$`) })).not.toBeInTheDocument()
  const row = screen.getByRole('button', { name: `${sectionTitle} 할 일 추가` })
  expect(row.closest('h3')).not.toBeNull()
  expect(row).toHaveAccessibleDescription(/\d{2}:\d{2}–\d{2}:\d{2}|언제든/)
}

// 4구간 제목이 화면에 놓인 순서(한 줄 행이든 펼친 구간이든)
function sectionTitlesInOrder() {
  return screen.getAllByRole('heading', { level: 3 }).map((h) => (h.textContent ?? '').match(/^(미분류|오전|오후|저녁)/)?.[1])
}

// 접혀 있을 때만 펼친다(오늘은 지금 구간과 할 일이 있는 미분류가 처음부터 열려 있다)
function openSection(sectionTitle: string) {
  const collapsed = screen.queryByRole('button', { name: `${sectionTitle} 섹션 펼치기` })
  if (collapsed) fireEvent.click(collapsed)
}

// 계획 화면 제목은 "1월 9일 금요일"처럼 요일까지 쓴다
function expectPageDate(dateLabel: string) {
  expect(screen.getByRole('heading', { level: 2, name: new RegExp(`^${dateLabel} .요일$`) })).toBeInTheDocument()
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
    // 화면이 아직 떠 있어 남은 삭제를 정리하거나 로그인 상태와 타이머를 바꾸면 다시 그려지므로 act 안에서 한다
    act(() => {
      resetPendingDeletes()
    })
    vi.useRealTimers()
    window.localStorage.clear()
    act(() => {
      useAuthStore.setState(initialAuthStore, true)
      useTimerStore.setState({ timers: {}, pendingAutoSessions: {} })
    })
    vi.restoreAllMocks()
  })

  it('opens the current mini-day section and 미분류 for today', async () => {
    await renderTodosPage({
      routeDateKey: selectedDateKey,
      now: new Date(2026, 0, 9, 9, 0, 0),
      items: [
        buildTodo({ title: '미분류 할 일', miniDay: 0 }),
        buildTodo({ title: '오전 할 일', miniDay: 1 }),
        buildTodo({ title: '오후 할 일', miniDay: 2 }),
      ],
    })

    expectPageDate('1월 9일')
    expectSectionExpanded('미분류')
    expectSectionExpanded('오전')
    expectSectionCollapsed('오후')
    expectSectionCompact('저녁')
    expect(screen.getByText('오전 할 일')).toBeInTheDocument()
    expect(screen.getByText('미분류 할 일')).toBeInTheDocument()
    expect(screen.queryByText('오후 할 일')).not.toBeInTheDocument()
  })

  it('defaults the calendar to week view on the todos page', async () => {
    await renderTodosPage({
      routeDateKey: selectedDateKey,
      now: new Date(2026, 0, 9, 9, 0, 0),
      items: [],
    })

    expect(screen.getByRole('radio', { name: '주 보기' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: '월 보기' })).toHaveAttribute('aria-checked', 'false')
  })

  // 고른 보기(월/주)는 다시 열어도 그대로다. 저장 키는 예전과 같아 이미 고른 사용자의 선택이 이어진다
  it('remembers the chosen calendar view when the page is opened again', async () => {
    seedCalendarViewMode('month')
    const rendered = await renderTodosPage({
      routeDateKey: selectedDateKey,
      now: new Date(2026, 0, 9, 9, 0, 0),
      items: [],
    })
    expect(screen.getByRole('radio', { name: '월 보기' })).toHaveAttribute('aria-checked', 'true')

    fireEvent.click(screen.getByRole('radio', { name: '주 보기' }))
    expect(window.localStorage.getItem('flowmate/ui/todos-calendar-view-mode')).toBe('week')

    rendered.unmount()
    await renderTodosPage({
      routeDateKey: selectedDateKey,
      now: new Date(2026, 0, 9, 9, 0, 0),
      items: [],
    })

    expect(screen.getByRole('radio', { name: '주 보기' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: '월 보기' })).toHaveAttribute('aria-checked', 'false')
  })

  // 사용자 결정(2026-10-20): 페이지 맨 위 제목 줄을 없애고, 예전처럼 목록 카드 머리 줄이 날짜를 맡는다.
  // 보이는 글자는 "1월 8일"이고, 제목 이름은 요일까지 읽힌다
  it('shows the date at the top of the list card, read with its weekday', async () => {
    const { container } = await renderTodosPage({ routeDateKey: '2026-01-08', now: new Date(2026, 0, 9, 9, 0, 0) })

    const title = screen.getByRole('heading', { level: 2, name: '1월 8일 목요일' })
    expect(title).toHaveClass('text-base', 'font-semibold')
    expect(within(title).getByText('1월 8일')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryByText('어제')).not.toBeInTheDocument()
    // 맨 위는 회고, 설정과 같은 페이지 제목 "계획"이고(h1은 이것 하나, 날짜는 목록 카드의 h2), 그 아래 달력 카드, 이어서 목록 카드다
    const header = container.querySelector('header')!
    expect(within(header).getByText('계획')).toHaveClass('text-xl', 'font-bold')
    expect(header.parentElement).toHaveClass('space-y-section')
    const calendarHeading = screen.getByRole('heading', { name: '2026년 1월' })
    expect(header.compareDocumentPosition(calendarHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(calendarHeading.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('puts the day total as plain green text next to the date', async () => {
    await renderTodosPage({
      routeDateKey: '2026-01-08',
      now: new Date(2026, 0, 9, 9, 0, 0),
      items: [buildTodo({ title: '어제 할 일', date: '2026-01-08', miniDay: 1, sessionCount: 3, sessionFocusSeconds: 75 * 60 })],
    })

    const title = screen.getByRole('heading', { level: 2, name: /.요일$/ })
    const pill = screen.getByText('총 집중 · 1시간 15분')
    expect(pill.parentElement).toBe(title.parentElement)
    expect(pill).toHaveClass('text-accent-text')
    expect(pill.className).not.toMatch(/(^| )bg-|rounded/)
  })

  it('keeps the month view when a date is picked', async () => {
    await renderTodosPage({ now: new Date(2026, 0, 9, 9, 0, 0) })
    fireEvent.click(screen.getByRole('radio', { name: '월 보기' }))

    fireEvent.click(screen.getByRole('button', { name: /^1월 20일 / }))
    await flushTodosPage()

    expect(screen.getByRole('radio', { name: '월 보기' })).toHaveAttribute('aria-checked', 'true')
    expectPageDate('1월 20일')
  })

  it('keeps the month view while moving between months', async () => {
    await renderTodosPage({ now: new Date(2026, 0, 9, 9, 0, 0) })
    fireEvent.click(screen.getByRole('radio', { name: '월 보기' }))

    fireEvent.click(screen.getByRole('button', { name: '다음 달' }))
    await flushTodosPage()

    expect(screen.getByRole('radio', { name: '월 보기' })).toHaveAttribute('aria-checked', 'true')
    expectPageDate('2월 1일')
  })

  it('hides expand-all and select on a day without todos', async () => {
    await renderTodosPage({ now: new Date(2026, 0, 9, 9, 0, 0) })

    expect(screen.queryByRole('button', { name: /모두 (펼침|접기)/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '선택' })).not.toBeInTheDocument()
  })

  it('opens only 미분류 for today when the current time is outside mini-day ranges', async () => {
    await renderTodosPage({
      routeDateKey: selectedDateKey,
      now: new Date(2026, 0, 9, 2, 0, 0),
      items: [
        buildTodo({ title: '미분류 할 일', miniDay: 0 }),
        buildTodo({ title: '오전 할 일', miniDay: 1 }),
      ],
    })

    expectSectionExpanded('미분류')
    expectSectionCollapsed('오전')
    expectSectionCompact('오후')
    expectSectionCompact('저녁')
    expect(screen.getByText('미분류 할 일')).toBeInTheDocument()
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

    expectSectionCompact('미분류')
    expectSectionExpanded('오전')
    expectSectionCompact('오후')
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

    expectSectionCompact('미분류')
    expectSectionCompact('오전')
    expectSectionExpanded('오후')
    expectSectionCompact('저녁')
    expect(screen.getByText('미래 오후 할 일')).toBeInTheDocument()
    expect(screen.queryByText('다른 날짜 할 일')).not.toBeInTheDocument()
  })

  it('keeps all four sections in place as one-line rows for empty future dates', async () => {
    await renderTodosPage({
      routeDateKey: '2026-01-12',
      now: new Date(2026, 0, 9, 9, 0, 0),
      items: [buildTodo({ title: '다른 날짜 할 일', miniDay: 1, date: '2026-01-11' })],
    })

    expect(sectionTitlesInOrder()).toEqual(['미분류', '오전', '오후', '저녁'])
    expectSectionCompact('미분류')
    expectSectionCompact('오전')
    expectSectionCompact('오후')
    expectSectionCompact('저녁')
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

    expectPageDate('1월 10일')
    expect(screen.getByText('1월 10일 오전 할 일')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^1월 11일 / }))
    await flushTodosPage()

    expectPageDate('1월 11일')
    expect(screen.getByText('1월 11일 오후 할 일')).toBeInTheDocument()
    expect(screen.queryByText('1월 10일 오전 할 일')).not.toBeInTheDocument()
    expectSectionCompact('미분류')
    expectSectionCompact('오전')
    expectSectionExpanded('오후')
  })

  // 4구간은 늘 시간 순서대로 제자리다(§2-1). 할 일이 없는 구간만 한 줄(44)로 줄여 첫 할 일을 덜 민다
  it('keeps all four sections in time order and shrinks only the empty ones to one-line rows in place', async () => {
    await renderTodosPage({
      routeDateKey: '2026-01-11',
      now: new Date(2026, 0, 9, 9, 0, 0),
      items: [
        buildTodo({ title: '오후 할 일', miniDay: 2, date: '2026-01-11' }),
        buildTodo({ title: '오전 할 일', miniDay: 1, date: '2026-01-11' }),
      ],
    })

    expect(sectionTitlesInOrder()).toEqual(['미분류', '오전', '오후', '저녁'])
    expectSectionCompact('미분류')
    expectSectionExpanded('오전')
    expectSectionExpanded('오후')
    expectSectionCompact('저녁')
    expect(screen.getByRole('button', { name: '저녁 할 일 추가' })).toHaveAccessibleDescription('18:00–24:00')
  })

  it('opens the input in place from a one-line row, and on Escape returns to the row with focus on it', async () => {
    await renderTodosPage({
      routeDateKey: '2026-01-11',
      now: new Date(2026, 0, 9, 9, 0, 0),
      items: [buildTodo({ title: '오후 할 일', miniDay: 2, date: '2026-01-11' })],
    })

    fireEvent.click(screen.getByRole('button', { name: '오전 할 일 추가' }))

    expect(sectionTitlesInOrder()).toEqual(['미분류', '오전', '오후', '저녁'])
    expectSectionExpanded('오전')
    const input = screen.getByPlaceholderText('오전에 할 일 추가')
    expect(input).toHaveFocus()

    fireEvent.keyDown(input, { key: 'Escape' })
    await flushTodosPage()

    expectSectionCompact('오전')
    // 포커스가 body로 떨어지지 않고 방금 연 한 줄 행으로 돌아온다
    expect(screen.getByRole('button', { name: '오전 할 일 추가' })).toHaveFocus()
  })

  it('does not pull focus back to the row when the empty input closes because the user moved elsewhere', async () => {
    await renderTodosPage({
      routeDateKey: '2026-01-11',
      now: new Date(2026, 0, 9, 9, 0, 0),
      items: [buildTodo({ title: '오후 할 일', miniDay: 2, date: '2026-01-11' })],
    })

    fireEvent.click(screen.getByRole('button', { name: '오전 할 일 추가' }))
    const elsewhere = screen.getByRole('button', { name: '선택' })
    act(() => elsewhere.focus())
    await flushTodosPage()

    expectSectionCompact('오전')
    expect(elsewhere).toHaveFocus()
  })

  it('keeps an empty current section open today with the greeting guide card instead of an input', async () => {
    await renderTodosPage({ now: new Date(2026, 0, 9, 9, 0, 0), items: [] })

    expect(sectionTitlesInOrder()).toEqual(['미분류', '오전', '오후', '저녁'])
    const currentTitle = screen.getByRole('heading', { level: 3, name: /오전/ })
    // 지금 구간은 스크린리더에만 알린다. 초록 제목과 점은 두지 않는다(사용자 결정 2026-10-20: 초록은 집중 시간에만)
    expect(currentTitle).toHaveTextContent('현재 시간대')
    expect(currentTitle).toHaveClass('text-text-primary')
    expect(currentTitle).not.toHaveClass('text-accent-text')
    expect(currentTitle.querySelector('.rounded-full')).toBeNull()
    // 사용자 결정(2026-10-20): 바꾸기 전 안내 카드(인사 문구 + 추가 버튼)로 되돌린다
    // 인사는 한 줄, 묻는 말은 다음 줄
    const greeting = screen.getByText('게스트님, 좋은 아침이에요')
    const question = screen.getByText('오전에 어떤 일부터 시작할까요?')
    expect(greeting.parentElement).toBe(question.parentElement)
    expect(greeting.parentElement?.querySelector('br')).not.toBeNull()
    expect(screen.getByRole('button', { name: '오전에 추가' })).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('오전에 할 일 추가')).not.toBeInTheDocument()
    expectSectionCompact('미분류')
    expectSectionCompact('저녁')
  })

  it('shows the day total focus next to the date title and colors only the focus part of each section line', async () => {
    await renderTodosPage({
      now: new Date(2026, 0, 9, 9, 0, 0),
      items: [
        buildTodo({ title: '오전 할 일', miniDay: 1, sessionCount: 1, sessionFocusSeconds: 25 * 60 }),
        buildTodo({ title: '오후 할 일', miniDay: 2, dayOrder: 1, sessionCount: 2, sessionFocusSeconds: 50 * 60 }),
      ],
    })

    const title = screen.getByRole('heading', { level: 2, name: /.요일$/ })
    const total = screen.getByText('총 집중 · 1시간 15분')
    expect(total).toHaveClass('text-accent-text')
    // 합계 알약은 날짜 바로 옆이다
    expect(total.parentElement).toBe(title.parentElement)
    expect(title.compareDocumentPosition(total) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getAllByText(/1시간 15분/)).toHaveLength(1)

    const sectionFocus = screen.getByText('집중 25분')
    expect(sectionFocus).toHaveClass('text-accent-text')
    expect(sectionFocus.parentElement).toHaveTextContent('06:00–12:00 · 1개 남음 · 집중 25분')
    expect(sectionFocus.parentElement).not.toHaveClass('text-accent-text')
  })

  it('makes one-line rows read-only in select mode and leaves room so the batch bar does not cover the last row', async () => {
    const { container } = await renderTodosPage({
      routeDateKey: '2026-01-11',
      now: new Date(2026, 0, 9, 9, 0, 0),
      items: [buildTodo({ title: '오후 할 일', miniDay: 2, date: '2026-01-11' })],
    })
    expect(container.querySelector('[data-batch-bar-spacer]')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '선택' }))

    expect(sectionTitlesInOrder()).toEqual(['미분류', '오전', '오후', '저녁'])
    expect(screen.queryByRole('button', { name: /할 일 추가$/ })).not.toBeInTheDocument()
    const spacer = container.querySelector<HTMLElement>('[data-batch-bar-spacer]')
    expect(spacer?.style.height).toContain('--batch-bar-offset')
  })

  // 회고 화면의 세션 상세 시트를 계획 화면에서도 연다(사용자 결정 2026-10-20)
  it('opens the session detail from the menu 집중 기록 item, one sheet at a time, and returns focus to the row', async () => {
    await renderTodosPage({
      items: [buildTodo({ title: '기록 있는 할 일', sessionCount: 2, sessionFocusSeconds: 1500, timerMode: 'stopwatch' })],
    })

    const titleButton = screen.getByRole('button', { name: '기록 있는 할 일 메뉴 열기' })
    titleButton.focus()
    fireEvent.click(titleButton)
    fireEvent.click(screen.getByRole('button', { name: '집중 기록' }))
    await flushTodosPage()

    const sheet = screen.getByRole('dialog', { name: '세션 상세' })
    expect(within(sheet).getByText('기록 있는 할 일')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '메모' })).not.toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    await flushTodosPage()
    expect(screen.queryByRole('dialog', { name: '세션 상세' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '기록 있는 할 일 메뉴 열기' })).toHaveFocus()
  })

  it('opens the session detail from a completed todo time line, but keeps the timer for an unfinished one', async () => {
    await renderTodosPage({
      items: [
        buildTodo({ title: '끝낸 할 일', isDone: true, sessionCount: 1, sessionFocusSeconds: 1500, timerMode: 'stopwatch' }),
        buildTodo({ title: '하는 중', dayOrder: 1, sessionCount: 1, sessionFocusSeconds: 600, timerMode: 'stopwatch' }),
      ],
    })

    expect(screen.queryByRole('button', { name: '하는 중 집중 기록 보기' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '하는 중 타이머 화면 열기' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '끝낸 할 일 집중 기록 보기' }))
    await flushTodosPage()
    expect(within(screen.getByRole('dialog', { name: '세션 상세' })).getByText('끝낸 할 일')).toBeInTheDocument()
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
    expect(screen.getByRole('button', { name: '오늘 하기' })).toBeInTheDocument()
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

    openSection('미분류')
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

    openSection('미분류')

    fireEvent.click(screen.getByText('같은 날 이동'))
    fireEvent.click(screen.getByRole('button', { name: '날짜 바꾸기' }))
    const sheet = screen.getByRole('dialog', { name: '날짜 바꾸기' })
    // 제목 아래에 어떤 할 일인지 보이고, 오늘은 날짜 칸 이름 끝의 "오늘"로도 읽힌다
    expect(within(sheet).getByText('같은 날 이동')).toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: /^1월 9일 .요일 오늘$/ })).toHaveAttribute('aria-pressed', 'true')
    expect(within(sheet).getByRole('button', { name: '이 날짜로 이동' })).toBeDisabled()
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
    fireEvent.click(screen.getByRole('button', { name: '오늘 하기' }))
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

    expectPageDate('1월 9일')
    expectSectionExpanded('미분류')
    expect(screen.getByText('기존 할 일')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('미분류 할 일 추가'))
    const todoInput = screen.getByPlaceholderText('미분류에 할 일 추가')
    fireEvent.change(todoInput, { target: { value: '새 할 일' } })
    fireEvent.blur(todoInput)
    await flushTodosPage()

    expect(screen.getByText('새 할 일')).toBeInTheDocument()
    expect(screen.getByText('언제든 · 2개 남음')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '새 할 일 완료' }))
    await flushTodosPage()

    expect(screen.getByText('언제든 · 1개 남음')).toBeInTheDocument()

    fireEvent.click(screen.getByText('기존 할 일'))
    fireEvent.click(screen.getByRole('button', { name: '기존 할 일 삭제' }))
    await flushTodosPage()

    expect(screen.queryByText('기존 할 일')).not.toBeInTheDocument()
  })
})

describe('TodosPage offline start', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    window.localStorage.clear()
    useAuthStore.setState(initialAuthStore, true)
    setGuestAuth()
    useTimerStore.setState({ timers: {}, pendingAutoSessions: {} })
  })

  afterEach(() => {
    onlineManager.setOnline(true)
    vi.useRealTimers()
    window.localStorage.clear()
    act(() => {
      useAuthStore.setState(initialAuthStore, true)
    })
  })

  // 오프라인으로 열면 조회가 연결을 기다린다(paused). 빈 목록(할 일 0개)처럼 보이지 않게 오프라인이라 못 불러왔다고 알린다
  it('shows an offline message instead of empty sections when opened offline, and loads after reconnecting', async () => {
    onlineManager.setOnline(false)
    await renderTodosPage({ items: [buildTodo({ title: '기존 할 일' })] })

    expect(screen.getByText('오프라인이라 할 일을 불러오지 못했어요. 연결되면 다시 불러와요.')).toBeInTheDocument()
    expect(screen.queryByText('기존 할 일')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /미분류 섹션/ })).not.toBeInTheDocument()

    act(() => onlineManager.setOnline(true))
    await flushTodosPage()

    expect(screen.getByText('기존 할 일')).toBeInTheDocument()
    expect(screen.queryByText('오프라인이라 할 일을 불러오지 못했어요. 연결되면 다시 불러와요.')).not.toBeInTheDocument()
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
    // 열린 타이머 화면이 구독하고 있어 act 안에서 비운다
    act(() => {
      useTimerStore.setState({ timers: {}, pendingAutoSessions: {} })
    })
    vi.restoreAllMocks()
  })

  async function renderWithTodos(titles: string[]) {
    const items = titles.map((title, index) => buildTodo({ title, dayOrder: index }))
    const result = await renderTodosPage({
      now: new Date(2026, 0, 9, 2, 0, 0),
      items,
    })
    openSection('미분류')
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
    fireEvent.click(screen.getByRole('button', { name: `${title} 삭제` }))
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

    const undoToast = screen.getByText('할 일 1개를 삭제했어요').closest('[role="status"]') as HTMLElement
    fireEvent.click(within(undoToast).getByRole('button', { name: '되돌리기' }))
    await wait(6000)

    expect(storedTitles()).toEqual(['할 일 C'])
    expect(screen.getAllByText('할 일 C')).toHaveLength(1)
    expect(screen.queryByText('할 일 A')).not.toBeInTheDocument()
  })

  // X6: 키보드로 메뉴의 "삭제"를 누르면 연 행이 숨겨져 포커스가 body로 사라졌다. 되돌리기로 옮기고, 토스트가 사라지면 다음 행으로 돌려준다
  it('moves focus to the undo action after deleting, then to the next row when the toast goes away', async () => {
    await renderWithTodos(['할 일 A', '할 일 B'])

    screen.getByRole('button', { name: '할 일 A 메뉴 열기' }).focus()
    fireEvent.click(screen.getByRole('button', { name: '할 일 A 메뉴 열기' }))
    await wait(400)
    const del = screen.getByRole('button', { name: '할 일 A 삭제' })
    del.focus()
    fireEvent.click(del)
    await wait(100)

    expect(screen.getByRole('button', { name: '되돌리기' })).toHaveFocus()

    // 5초가 지나 토스트가 닫힌다(act 하나로 넘기면 닫힘과 빠짐이 한 번에 반영돼 나눠서 기다린다)
    await wait(5200)
    await wait(800)
    expect(screen.getByRole('button', { name: '할 일 B 메뉴 열기' })).toHaveFocus()
  })

  it('moves focus back to the restored row after undoing with the keyboard', async () => {
    await renderWithTodos(['할 일 A', '할 일 B'])

    fireEvent.click(screen.getByRole('button', { name: '할 일 A 메뉴 열기' }))
    await wait(400)
    const del = screen.getByRole('button', { name: '할 일 A 삭제' })
    del.focus()
    fireEvent.click(del)
    await wait(100)

    const undo = screen.getByRole('button', { name: '되돌리기' })
    expect(undo).toHaveFocus()
    fireEvent.click(undo)
    await wait(700)

    expect(screen.getByRole('button', { name: '할 일 A 메뉴 열기' })).toHaveFocus()
  })

  it('names the deleted todo in the undo toast, and counts todos for a batch delete', async () => {
    await renderWithTodos(['은행 들르기', '보고서 작성', '장보기'])

    deleteOne('은행 들르기')
    await wait(100)
    expect(screen.getByText("'은행 들르기'를 삭제했어요")).toBeInTheDocument()

    batchDelete(['보고서 작성', '장보기'])
    await wait(100)
    expect(screen.getByText('할 일 2개를 삭제했어요')).toBeInTheDocument()
  })

  it('names the todo in the complete and uncomplete undo toasts', async () => {
    await renderWithTodos(['은행 들르기'])

    fireEvent.click(screen.getByRole('button', { name: '은행 들르기 완료' }))
    await wait(100)
    expect(screen.getByText("'은행 들르기'를 완료했어요")).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '은행 들르기 완료 취소' }))
    await wait(100)
    expect(screen.getByText("'은행 들르기' 완료를 취소했어요")).toBeInTheDocument()
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
  const navigate = useNavigate()
  return (
    <>
      <output data-testid="location">{location.pathname + location.search}</output>
      {/* 하단 탭이나 단축키처럼 날짜 없이 /todos로 이동한다 */}
      <button type="button" onClick={() => navigate('/todos')}>할 일 탭으로 이동</button>
    </>
  )
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
    // 열린 타이머 화면이 구독하고 있어 act 안에서 비운다
    act(() => {
      useTimerStore.setState({ timers: {}, pendingAutoSessions: {} })
    })
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
    return screen.getByPlaceholderText('미분류에 할 일 추가') as HTMLTextAreaElement
  }

  function startEditing(title: string) {
    fireEvent.click(screen.getByText(title))
    fireEvent.click(screen.getByRole('button', { name: `${title} 수정` }))
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
    openSection('미분류')

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
    openSection('미분류')

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
    openSection('미분류')

    fireEvent.click(screen.getByRole('button', { name: '할 일 A 완료' }))
    await wait(700)
    fireEvent.click(screen.getByRole('button', { name: '되돌리기' }))
    await wait(700)

    expect(visibleTodoTitles()).toEqual(['할 일 A', '할 일 B', '할 일 C', '끝낸 일'])
  })

  it('clears the input right away so the next todo can be typed while saving', async () => {
    await renderPage()
    openSection('미분류')

    const input = openUncategorizedInput()
    fireEvent.change(input, { target: { value: '  첫째  ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(input.value).toBe('')

    fireEvent.change(input, { target: { value: '둘째' } })
    await wait(700)

    // 첫 할 일이 목록에 나타나도 같은 입력창이 유지되어야 한다.
    expect(screen.getByPlaceholderText('미분류에 할 일 추가')).toHaveValue('둘째')
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

  it('keeps an empty section open when leaving the input right after adding with Enter', async () => {
    await renderPage()

    const input = openUncategorizedInput()
    fireEvent.change(input, { target: { value: '엔터로 추가' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.blur(input)
    await wait(700)

    expectSectionExpanded('미분류')
    expect(screen.getByText('엔터로 추가')).toBeInTheDocument()
  })

  it('brings the title back with an error when adding fails and the input is still empty', async () => {
    await renderPage()
    server.use(
      http.post('/api/todos', () => HttpResponse.json({ error: { message: 'boom' } }, { status: 500 })),
    )
    openSection('미분류')

    const input = openUncategorizedInput()
    fireEvent.change(input, { target: { value: '첫째' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await wait(700)

    expect(input.value).toBe('첫째')
    expect(screen.getByText('할 일을 추가하지 못했어요. 다시 시도해 주세요.')).toBeInTheDocument()
  })

  // 배너가 "지금은 저장되지 않아요"라고 말하는 동안에는 저장을 보내지 않고, 입력한 글을 그대로 둔다
  function goOffline() {
    const spy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    return () => spy.mockReturnValue(true)
  }

  it('keeps the typed title and says it was not added while offline, then adds it once when back online', async () => {
    await renderPage()
    openSection('미분류')
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const goOnline = goOffline()

    const input = openUncategorizedInput()
    fireEvent.change(input, { target: { value: '오프라인 할 일' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await wait(700)

    expect(input.value).toBe('오프라인 할 일')
    expect(screen.getByText('오프라인이라 추가하지 못했어요. 연결되면 다시 시도해 주세요.')).toBeInTheDocument()
    expect(countRequests(fetchSpy, 'POST')).toBe(0)

    goOnline()
    await act(async () => {
      window.dispatchEvent(new Event('online'))
    })
    await wait(700)
    // 연결돼도 말없이 보내지 않는다
    expect(countRequests(fetchSpy, 'POST')).toBe(0)

    fireEvent.keyDown(input, { key: 'Enter' })
    await wait(700)

    expect(countRequests(fetchSpy, 'POST')).toBe(1)
    expect(readStoredTodos().filter((todo) => todo.title === '오프라인 할 일')).toHaveLength(1)
    expect(input.value).toBe('')
  })

  it('keeps the input line and its text when leaving it while offline', async () => {
    await renderPage({ items: [buildTodo({ title: '할 일 A' })] })
    openSection('미분류')
    goOffline()

    const input = openUncategorizedInput()
    fireEvent.change(input, { target: { value: '나가며 쓴 글' } })
    fireEvent.blur(input)
    await wait(700)

    expect(screen.getByPlaceholderText('미분류에 할 일 추가')).toHaveValue('나가며 쓴 글')
    expect(screen.getByText('오프라인이라 추가하지 못했어요. 연결되면 다시 시도해 주세요.')).toBeInTheDocument()
  })

  it('keeps editing with the typed title while offline instead of saving later', async () => {
    await renderPage({ items: [buildTodo({ title: '할 일 A' })] })
    openSection('미분류')
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    goOffline()

    const textarea = startEditing('할 일 A')
    fireEvent.change(textarea, { target: { value: '고친 제목' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })
    await wait(700)

    expect(screen.getByDisplayValue('고친 제목')).toBeInTheDocument()
    expect(screen.getByText('오프라인이라 수정하지 못했어요. 연결되면 다시 시도해 주세요.')).toBeInTheDocument()
    expect(countRequests(fetchSpy, 'PATCH')).toBe(0)
    expect(readStoredTodos()[0]).toMatchObject({ title: '할 일 A' })
  })

  it('says completing failed instead of leaving the done toast when the save fails', async () => {
    await renderPage({ items: [buildTodo({ title: '할 일 A' })] })
    openSection('미분류')
    server.use(
      http.patch('/api/todos/:id', () => HttpResponse.json({ error: { message: 'boom' } }, { status: 500 })),
    )

    fireEvent.click(screen.getByRole('button', { name: '할 일 A 완료' }))
    await wait(700)

    expect(screen.getByRole('button', { name: '할 일 A 완료' })).toBeInTheDocument()
    expect(screen.queryByText("'할 일 A'를 완료했어요")).not.toBeInTheDocument()
    expect(screen.getByText('수정하지 못했어요. 다시 시도해 주세요.')).toBeInTheDocument()
  })

  function openNote(title: string) {
    fireEvent.click(screen.getByText(title))
    fireEvent.click(screen.getByRole('button', { name: '메모' }))
  }

  // 메모와 회고는 나가면 저장한다(사용자 결정 2026-10-20). 버릴지 묻는 확인 시트는 없다
  it('saves an edited memo when the sheet is closed instead of asking to discard it', async () => {
    await renderPage({ items: [buildTodo({ title: '할 일 A', note: '기존 메모' })] })
    openSection('미분류')
    openNote('할 일 A')
    await wait(400)

    fireEvent.click(screen.getByRole('button', { name: '할 일 A 메모 수정' }))
    fireEvent.change(screen.getByRole('textbox', { name: '할 일 A 메모' }), { target: { value: '기존 메모 더 씀' } })
    fireEvent.click(screen.getByRole('button', { name: '닫기' }))
    await wait(700)

    expect(screen.queryByRole('dialog', { name: '고친 메모를 버릴까요?' })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: '할 일 A 메모' })).not.toBeInTheDocument()
    expect(readStoredTodos()[0]).toMatchObject({ note: '기존 메모 더 씀' })
  })

  it('keeps the memo sheet open with the typed text when saving on close fails', async () => {
    await renderPage({ items: [buildTodo({ title: '할 일 A', note: '기존 메모' })] })
    openSection('미분류')
    openNote('할 일 A')
    await wait(400)
    server.use(
      http.patch('/api/todos/:id', () => HttpResponse.json({ error: { message: 'boom' } }, { status: 500 })),
    )

    fireEvent.click(screen.getByRole('button', { name: '할 일 A 메모 수정' }))
    fireEvent.change(screen.getByRole('textbox', { name: '할 일 A 메모' }), { target: { value: '지킬 메모' } })
    fireEvent.click(screen.getByRole('button', { name: '닫기' }))
    await wait(700)

    expect(screen.getByRole('textbox', { name: '할 일 A 메모' })).toHaveValue('지킬 메모')
    expect(screen.getByText('메모를 저장하지 못했어요. 다시 시도해 주세요.')).toBeInTheDocument()
  })

  it('reverts the memo and stays open when Escape is pressed while editing', async () => {
    await renderPage({ items: [buildTodo({ title: '할 일 A', note: '기존 메모' })] })
    openSection('미분류')
    openNote('할 일 A')
    await wait(400)

    fireEvent.click(screen.getByRole('button', { name: '할 일 A 메모 수정' }))
    const textarea = screen.getByRole('textbox', { name: '할 일 A 메모' })
    fireEvent.change(textarea, { target: { value: '버릴 글' } })
    fireEvent.keyDown(textarea, { key: 'Escape' })
    await wait(400)

    const dialog = screen.getByRole('dialog', { name: '할 일 A' })
    // 보기 모드로 돌아가 textarea는 aria-hidden이다
    expect(dialog.querySelector('textarea')).toHaveValue('기존 메모')
    expect(within(dialog).getByRole('button', { name: '할 일 A 메모 수정' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '저장' })).not.toBeInTheDocument()
    expect(readStoredTodos()[0]).toMatchObject({ note: '기존 메모' })
  })

  it('closes an unchanged memo without asking', async () => {
    await renderPage({ items: [buildTodo({ title: '할 일 A', note: '기존 메모' })] })
    openSection('미분류')
    openNote('할 일 A')
    await wait(400)

    fireEvent.click(screen.getByRole('button', { name: '할 일 A 메모 수정' }))
    fireEvent.click(screen.getByRole('button', { name: '닫기' }))
    await wait(400)

    expect(screen.queryByRole('dialog', { name: '고친 메모를 버릴까요?' })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: '할 일 A 메모' })).not.toBeInTheDocument()
  })

  // 삭제는 편집에 들어가지 않아도 메모 시트 보기 모드 제목 줄에 있다(사용자 결정 2026-10-21)
  it('deletes a memo with an undo toast that names the todo, and undo brings the memo back', async () => {
    await renderPage({ items: [buildTodo({ title: '할 일 A', note: '기존 메모' })] })
    openSection('미분류')
    openNote('할 일 A')
    await wait(400)

    fireEvent.click(screen.getByRole('button', { name: '삭제' }))
    await wait(700)

    expect(screen.getByText("'할 일 A' 메모를 삭제했어요")).toBeInTheDocument()
    expect(readStoredTodos()[0]).toMatchObject({ note: null })
    // 시트가 닫혀 포커스가 갈 곳을 잃으면 되돌리기로 옮긴다(토스트가 그려진 뒤 한 틱)
    await wait(50)
    expect(screen.getByRole('button', { name: '되돌리기' })).toHaveFocus()

    fireEvent.click(screen.getByRole('button', { name: '되돌리기' }))
    await wait(700)
    expect(screen.getByRole('button', { name: '할 일 A 메뉴 열기' })).toHaveFocus()

    expect(readStoredTodos()[0]).toMatchObject({ note: '기존 메모' })
    expect(screen.getByText('기존 메모')).toBeInTheDocument()
  })

  // 되돌리기가 그사이 새로 쓴 메모를 지운 메모로 덮어쓰지 않게, 메모를 다시 열면 되돌리기 토스트를 닫는다
  it('closes the memo undo toast when the memo is opened again', async () => {
    await renderPage({ items: [buildTodo({ title: '할 일 A', note: '기존 메모' })] })
    openSection('미분류')
    openNote('할 일 A')
    await wait(400)
    fireEvent.click(screen.getByRole('button', { name: '할 일 A 메모 수정' }))
    fireEvent.click(screen.getByRole('button', { name: '삭제' }))
    await wait(700)
    expect(screen.getByText("'할 일 A' 메모를 삭제했어요")).toBeInTheDocument()

    openNote('할 일 A')
    await wait(1200)

    expect(screen.queryByText("'할 일 A' 메모를 삭제했어요")).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '되돌리기' })).not.toBeInTheDocument()
  })

  it('has no delete button for a memo that was never saved', async () => {
    await renderPage({ items: [buildTodo({ title: '할 일 A', note: null })] })
    openSection('미분류')
    openNote('할 일 A')
    await wait(400)

    expect(screen.getByRole('textbox', { name: '할 일 A 메모' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '삭제' })).not.toBeInTheDocument()
  })

  it('keeps what was typed next when adding the previous todo fails', async () => {
    await renderPage()
    server.use(
      http.post('/api/todos', async () => {
        await delay(200)
        return HttpResponse.json({ error: { message: 'boom' } }, { status: 500 })
      }),
    )
    openSection('미분류')

    const input = openUncategorizedInput()
    fireEvent.change(input, { target: { value: '첫째' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.change(input, { target: { value: '둘째' } })
    await wait(700)

    expect(input.value).toBe('둘째')
  })

  it('ignores Enter while a Korean IME is still composing', async () => {
    await renderPage()
    openSection('미분류')

    const input = openUncategorizedInput()
    fireEvent.change(input, { target: { value: '한글' } })
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
    await wait(700)

    expect(input.value).toBe('한글')
    expect(readStoredTodos()).toEqual([])
  })

  it('leaves editing with the original title when the title is cleared', async () => {
    await renderPage({ items: [buildTodo({ title: '할 일 A' })] })
    openSection('미분류')
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
    openSection('미분류')
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
    openSection('미분류')
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
    openSection('미분류')

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
    openSection('미분류')
    server.use(
      http.patch('/api/todos/:id', () => HttpResponse.json({ error: { message: 'boom' } }, { status: 500 })),
    )

    const textarea = startEditing('할 일 A')
    fireEvent.change(textarea, { target: { value: '고친 할 일' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })
    await wait(700)

    expect(screen.getByText('수정하지 못했어요. 다시 시도해 주세요.')).toBeInTheDocument()
    expect(screen.getByText('할 일 A')).toBeInTheDocument()
  })

  it('shows a load error with retry instead of the empty guide when todos fail to load', async () => {
    server.use(
      http.get('/api/todos', () => HttpResponse.json({ error: { message: 'boom' } }, { status: 500 }), {
        once: true,
      }),
    )
    await renderPage({ items: [buildTodo({ title: '할 일 A' })] })

    expect(screen.getByText('할 일을 불러오지 못했어요')).toBeInTheDocument()
    expect(screen.queryByText(/떠오른 일을 먼저 적어둘까요/)).not.toBeInTheDocument()
    // 실패 안내는 카드에 담지 않는 한 줄이다(§3-2, InlineStatus)
    expect(screen.getByRole('alert').closest('.rounded-card')).toBeNull()
    expect(screen.getByRole('alert').className).not.toMatch(/(^|\s)bg-/)

    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    await wait(700)

    expect(screen.queryByText('할 일을 불러오지 못했어요')).not.toBeInTheDocument()
    openSection('미분류')
    expect(screen.getByText('할 일 A')).toBeInTheDocument()
  })

  it('follows the new day at midnight and adds todos to it', async () => {
    await renderPage({ route: '/todos', now: new Date(2026, 0, 9, 23, 59, 30) })
    expectPageDate('1월 9일')

    await wait(60_000)
    expectPageDate('1월 10일')

    openSection('미분류')
    const input = openUncategorizedInput()
    fireEvent.change(input, { target: { value: '새날 할 일' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await wait(700)

    expect(readStoredTodos()[0]).toMatchObject({ title: '새날 할 일', date: '2026-01-10' })
  })

  it('follows the new day when the app comes back to the foreground', async () => {
    await renderPage({ route: '/todos', now: new Date(2026, 0, 9, 21, 0, 0) })
    expectPageDate('1월 9일')

    vi.setSystemTime(new Date(2026, 0, 10, 8, 0, 0))
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expectPageDate('1월 10일')
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/todos$/)
  })

  it('keeps the section the user was looking at open when the time section changes', async () => {
    await renderPage({
      route: '/todos',
      now: new Date(2026, 0, 9, 11, 59, 30),
      items: [
        buildTodo({ title: '오전 할 일', miniDay: 1 }),
        buildTodo({ title: '오후 할 일', miniDay: 2 }),
      ],
    })
    expectSectionExpanded('오전')
    expectSectionCollapsed('오후')

    await wait(60_000)

    expectSectionExpanded('오전')
    expectSectionExpanded('오후')
    expect(screen.getByText('오전 할 일')).toBeInTheDocument()
  })

  it('shows today when the todos tab is opened without a date', async () => {
    await renderPage({ route: '/todos?date=2026-01-08', now: new Date(2026, 0, 9, 9, 0, 0) })
    expectPageDate('1월 8일')

    fireEvent.click(screen.getByRole('button', { name: '할 일 탭으로 이동' }))

    expectPageDate('1월 9일')
  })

  it('moves the current time badge when the time section changes', async () => {
    await renderPage({ route: '/todos', now: new Date(2026, 0, 9, 11, 59, 30) })
    expect(screen.getByText('현재 시간대').parentElement).toHaveTextContent('오전')

    await wait(60_000)
    expect(screen.getByText('현재 시간대').parentElement).toHaveTextContent('오후')
  })

  it('stays on a past date the user picked when the day changes', async () => {
    await renderPage({ route: '/todos?date=2026-01-08', now: new Date(2026, 0, 9, 23, 59, 30) })
    expectPageDate('1월 8일')

    await wait(60_000)
    expectPageDate('1월 8일')
  })

  it('drops the date from the address when today is picked', async () => {
    await renderPage({ route: '/todos?date=2026-01-08', now: new Date(2026, 0, 9, 9, 0, 0) })
    expect(screen.getByTestId('location')).toHaveTextContent('/todos?date=2026-01-08')

    fireEvent.click(screen.getByRole('button', { name: /^1월 9일 .요일 오늘/ }))

    expectPageDate('1월 9일')
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/todos$/)
  })

  it('shows an error when moving a todo to another day fails', async () => {
    await renderPage({ items: [buildTodo({ title: '할 일 A' })] })
    openSection('미분류')
    server.use(
      http.patch('/api/todos/:id', () => HttpResponse.json({ error: { message: 'boom' } }, { status: 500 })),
    )

    fireEvent.click(screen.getByText('할 일 A'))
    fireEvent.click(screen.getByRole('button', { name: '내일 하기' }))
    await wait(700)

    expect(screen.getByText('날짜를 바꾸지 못했어요. 다시 시도해 주세요')).toBeInTheDocument()
  })

  // 행의 집중 버튼(시작 전이면 고르는 메뉴, 시작했으면 바로 연다)
  const timerScreen = () => document.querySelector<HTMLElement>('[data-timer-fullscreen]')
  const pausedStopwatch = {
    ...initialSingleTimerState,
    mode: 'stopwatch' as const,
    status: 'paused' as const,
    flexiblePhase: 'focus' as const,
    focusElapsedMs: 60_000,
  }

  // 집중 시작 버튼은 그 자리에 고르는 메뉴를 띄운다. 고른 모드로 타이머를 열고 시작한다
  const chooseTimer = (title: string, option: '일반 타이머' | '뽀모도로 타이머') => {
    fireEvent.click(screen.getByRole('button', { name: `${title} 집중 시작` }))
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: new RegExp(`^${option}`) }))
  }

  it('opens a small menu by the start button with both timers, marks the last mode and focuses it', async () => {
    const todo = buildTodo({ title: '할 일 A', timerMode: 'stopwatch' })
    await renderPage({ items: [todo] })
    const start = screen.getByRole('button', { name: '할 일 A 집중 시작' })
    expect(start).toHaveAttribute('aria-haspopup', 'menu')
    expect(start).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(start)
    await wait(50)

    const menu = screen.getByRole('menu', { name: '할 일 A 타이머 고르기' })
    const stopwatch = within(menu).getByRole('menuitem', { name: '일반 타이머 최근' })
    const pomodoro = within(menu).getByRole('menuitem', { name: '뽀모도로 타이머' })
    expect(start).toHaveAttribute('aria-expanded', 'true')
    expect(stopwatch).toHaveFocus()
    // 배경을 덮지 않는 메뉴라 시트(dialog)가 아니다
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    // 화살표 키로 항목을 옮긴다(끝에서 처음으로 돈다)
    fireEvent.keyDown(stopwatch, { key: 'ArrowDown' })
    expect(pomodoro).toHaveFocus()
    fireEvent.keyDown(pomodoro, { key: 'ArrowDown' })
    expect(stopwatch).toHaveFocus()
    fireEvent.keyDown(stopwatch, { key: 'ArrowUp' })
    expect(pomodoro).toHaveFocus()
    // 고르기 전에는 시작하지 않는다
    expect(useTimerStore.getState().timers[todo.id as string]).toBeUndefined()
    expect(timerScreen()).toBeNull()
  })

  it('starts the stopwatch when 일반 타이머 is chosen and opens the timer', async () => {
    const todo = buildTodo({ title: '할 일 A', timerMode: 'pomodoro' })
    await renderPage({ items: [todo] })

    chooseTimer('할 일 A', '일반 타이머')
    await wait(100)

    expect(useTimerStore.getState().timers[todo.id as string]).toMatchObject({ mode: 'stopwatch', status: 'running' })
    expect(timerScreen()).not.toBeNull()
    // 모드 제목은 없앴다. 일반 타이머라는 것은 진행 중에만 보이는 표시 기준 토글로 확인한다
    expect(within(timerScreen()!).getByRole('radiogroup', { name: '스톱워치 표시 기준' })).toBeInTheDocument()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('starts a pomodoro when 뽀모도로 타이머 is chosen, and remembers the mode', async () => {
    const todo = buildTodo({ title: '할 일 A' })
    await renderPage({ items: [todo] })

    fireEvent.click(screen.getByRole('button', { name: '할 일 A 집중 시작' }))
    await wait(50)
    // 처음 여는 할 일은 최근 표시가 없고 첫 항목에 포커스가 간다
    const menu = screen.getByRole('menu')
    expect(within(menu).queryByText('최근')).not.toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: '일반 타이머' })).toHaveFocus()

    fireEvent.click(within(menu).getByRole('menuitem', { name: '뽀모도로 타이머' }))
    await wait(700)

    expect(useTimerStore.getState().timers[todo.id as string]).toMatchObject({ mode: 'pomodoro', status: 'running' })
    expect(readStoredTodos()[0]).toMatchObject({ timerMode: 'pomodoro' })
  })

  it('closes the menu with Escape without starting, and returns focus to the start button', async () => {
    const todo = buildTodo({ title: '할 일 A', timerMode: 'stopwatch' })
    await renderPage({ items: [todo] })
    const start = screen.getByRole('button', { name: '할 일 A 집중 시작' })

    fireEvent.click(start)
    await wait(50)
    fireEvent.keyDown(within(screen.getByRole('menu')).getByRole('menuitem', { name: /^일반 타이머/ }), { key: 'Escape' })
    await wait(50)

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(start).toHaveFocus()
    expect(start).toHaveAttribute('aria-expanded', 'false')
    expect(useTimerStore.getState().timers[todo.id as string]).toBeUndefined()
    expect(timerScreen()).toBeNull()
  })

  it('closes the menu on an outside tap or a scroll, and keeps only one menu open', async () => {
    await renderPage({ items: [buildTodo({ title: '할 일 A' }), buildTodo({ title: '할 일 B', dayOrder: 1 })] })

    fireEvent.click(screen.getByRole('button', { name: '할 일 A 집중 시작' }))
    expect(screen.getByRole('menu', { name: '할 일 A 타이머 고르기' })).toBeInTheDocument()
    // 다른 행의 버튼을 누르면 앞 메뉴는 닫히고 그 행의 메뉴만 남는다
    const startB = screen.getByRole('button', { name: '할 일 B 집중 시작' })
    fireEvent.pointerDown(startB)
    fireEvent.click(startB)
    expect(screen.getAllByRole('menu')).toHaveLength(1)
    expect(screen.getByRole('menu', { name: '할 일 B 타이머 고르기' })).toBeInTheDocument()
    // 같은 버튼을 다시 누르면 닫힌다
    fireEvent.pointerDown(startB)
    fireEvent.click(startB)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    fireEvent.click(startB)
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    fireEvent.click(startB)
    fireEvent.scroll(window)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  // 메뉴를 연 사이 다른 기기(SSE)나 다시 불러오기로 목록이 바뀐 경우
  const updateCachedTodos = async (
    queryClient: ReturnType<typeof renderApp>['queryClient'],
    update: (items: TodoList['items']) => TodoList['items'],
  ) => {
    act(() => {
      queryClient.setQueryData<TodoList>(queryKeys.todos(), (prev) => (prev ? { ...prev, items: update(prev.items) } : prev))
    })
    // React Query는 구독자에게 다음 틱에 알린다
    await wait(10)
  }

  it('closes the menu when its todo disappears from the list or gets done elsewhere', async () => {
    const a = buildTodo({ title: '할 일 A' })
    const b = buildTodo({ title: '할 일 B', dayOrder: 1 })
    const { queryClient } = await renderPage({ items: [a, b] })

    fireEvent.click(screen.getByRole('button', { name: '할 일 A 집중 시작' }))
    expect(screen.getByRole('menu', { name: '할 일 A 타이머 고르기' })).toBeInTheDocument()
    await updateCachedTodos(queryClient, (items) => items.filter((todo) => todo.id !== a.id))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    const startB = screen.getByRole('button', { name: '할 일 B 집중 시작' })
    fireEvent.click(startB)
    expect(screen.getByRole('menu', { name: '할 일 B 타이머 고르기' })).toBeInTheDocument()
    await updateCachedTodos(queryClient, (items) => items.map((todo) => (todo.id === b.id ? { ...todo, isDone: true } : todo)))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(useTimerStore.getState().timers[b.id as string]).toBeUndefined()
  })

  it('closes the menu when its start button is no longer on the page', async () => {
    const a = buildTodo({ title: '할 일 A' })
    const { queryClient } = await renderPage({ items: [a] })

    fireEvent.click(screen.getByRole('button', { name: '할 일 A 집중 시작' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    // 다른 기기에서 다른 구간으로 옮기면 행이 새로 그려져(접힌 구간) 메뉴를 연 버튼이 떨어진다
    await updateCachedTodos(queryClient, (items) => items.map((todo) => (todo.id === a.id ? { ...todo, miniDay: 3 } : todo)))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('starts with the latest todo from the list, not the one seen when the menu opened', async () => {
    const a = buildTodo({ title: '할 일 A' })
    const { queryClient } = await renderPage({ items: [a] })

    fireEvent.click(screen.getByRole('button', { name: '할 일 A 집중 시작' }))
    await updateCachedTodos(queryClient, (items) =>
      items.map((todo) => (todo.id === a.id ? { ...todo, title: '할 일 A2', timerMode: 'pomodoro' } : todo)),
    )
    // 메뉴는 지금 목록의 제목과 마지막 모드로 바뀐다
    const menu = screen.getByRole('menu', { name: '할 일 A2 타이머 고르기' })
    fireEvent.click(within(menu).getByRole('menuitem', { name: /^일반 타이머/ }))
    await wait(100)

    expect(useTimerStore.getState().timers[a.id as string]).toMatchObject({ mode: 'stopwatch', status: 'running' })
    expect(within(timerScreen()!).getByText('할 일 A2')).toBeInTheDocument()
  })

  it('closes the menu without starting when the todo gets a timer elsewhere while the menu is open', async () => {
    const a = buildTodo({ title: '할 일 A' })
    await renderPage({ items: [a] })
    const startPomodoro = vi.spyOn(useTimerStore.getState(), 'startPomodoro')

    fireEvent.click(screen.getByRole('button', { name: '할 일 A 집중 시작' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    // 다른 기기에서 이 할 일의 일반 타이머를 썼다. ▶가 사라지고 시간 줄이 생기므로 메뉴도 닫는다
    act(() => {
      useTimerStore.setState({ timers: { [a.id as string]: pausedStopwatch } })
    })
    await wait(10)

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '할 일 A 집중 시작' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '할 일 A 타이머 화면 열기' })).toBeInTheDocument()
    expect(startPomodoro).not.toHaveBeenCalled()
    expect(useTimerStore.getState().timers[a.id as string]).toMatchObject({ mode: 'stopwatch', status: 'paused' })
  })

  it("does not start while another todo's timer runs, and says which one is running", async () => {
    const mine = buildTodo({ title: '할 일 A' })
    const other = buildTodo({ title: '은행 들르기', date: '2026-01-08' })
    await renderPage({ items: [mine, other] })
    act(() => {
      useTimerStore.setState({
        timers: {
          [other.id as string]: {
            ...initialSingleTimerState,
            mode: 'stopwatch',
            status: 'running',
            flexiblePhase: 'focus',
            focusStartedAt: Date.now(),
          },
        },
      })
    })

    fireEvent.click(screen.getByRole('button', { name: '할 일 A 집중 시작' }))
    await wait(100)

    expect(screen.getByText("'은행 들르기' 타이머가 실행 중이에요")).toBeInTheDocument()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(useTimerStore.getState().timers[mine.id as string]).toBeUndefined()
    expect(timerScreen()).toBeNull()
  })

  it('scrolls to and briefly highlights the next todo of the section after completing one from the timer', async () => {
    const first = buildTodo({ title: '할 일 A', dayOrder: 0, timerMode: 'stopwatch' })
    const next = buildTodo({ title: '할 일 B', dayOrder: 1 })
    await renderPage({ items: [first, next] })
    const scrollIntoView = vi.fn()
    // jsdom은 scrollIntoView를 그리지 않으므로 호출만 확인한다
    const original = HTMLElement.prototype.scrollIntoView
    HTMLElement.prototype.scrollIntoView = scrollIntoView
    onTestFinished(() => {
      HTMLElement.prototype.scrollIntoView = original
    })

    chooseTimer('할 일 A', '일반 타이머')
    await wait(100)
    // 아직 기록할 집중이 없어(100ms) 확인 없이 바로 완료한다(.impeccable.md §8)
    fireEvent.click(within(timerScreen()!).getByRole('button', { name: '완료' }))
    expect(screen.queryByRole('dialog', { name: '이 할 일을 완료할까요?' })).not.toBeInTheDocument()
    await wait(700)

    expect(timerScreen()).toBeNull()
    const nextRow = () => screen.getByRole('button', { name: '할 일 B 메뉴 열기' }).closest('[data-todo-id]')
    expect(nextRow()).toHaveAttribute('data-highlighted', 'true')
    expect(scrollIntoView).toHaveBeenCalled()

    await wait(1600)
    expect(nextRow()).not.toHaveAttribute('data-highlighted')
  })

  it('opens the input from the guide card button in an empty current section and adds there', async () => {
    await renderPage({ now: new Date(2026, 0, 9, 9, 0, 0) })

    expect(screen.queryByPlaceholderText('오전에 할 일 추가')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '오전에 추가' }))

    const input = screen.getByPlaceholderText('오전에 할 일 추가')
    expect(input).toHaveFocus()
    expect(screen.queryByRole('button', { name: '오전에 추가' })).not.toBeInTheDocument()

    fireEvent.change(input, { target: { value: '아침 운동' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await wait(700)

    expect(readStoredTodos()[0]).toMatchObject({ title: '아침 운동', miniDay: 1 })
    expect(screen.getByText('아침 운동')).toBeInTheDocument()
    // 첫 할 일이 생기면 안내 카드는 다시 나오지 않는다
    expect(screen.queryByText(/어떤 일부터 시작할까요/)).not.toBeInTheDocument()
  })

  it('select mode shows the bar right away, hides the row focus and menu buttons, and ends with 취소 in the list header', async () => {
    await renderPage({ items: [buildTodo({ title: '할 일 A' }), buildTodo({ title: '할 일 B', dayOrder: 1 })] })

    fireEvent.click(screen.getByRole('button', { name: '선택' }))

    expect(screen.getByText('선택한 할 일이 없어요')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /집중 시작/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /메뉴 열기/ })).not.toBeInTheDocument()
    // 선택 모드에서는 구간 + 도 숨긴다(입력 줄이 열리면 선택과 섞인다)
    expect(screen.queryByRole('button', { name: '미분류 할 일 추가' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '할 일 B 선택' }))
    expect(screen.getByText('1개 선택')).toBeInTheDocument()

    // 선택 자리의 글자 버튼이 초록 "✓ 취소"로 바뀌고, 누르면 선택 모드를 끝낸다
    const cancel = screen.getByRole('button', { name: '취소' })
    expect(cancel).toHaveClass('text-accent-text')
    fireEvent.click(cancel)
    expect(screen.queryByText('1개 선택')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '할 일 A 집중 시작' })).toBeInTheDocument()
  })

  it('gives keyboard sorting to an invisible layer over the row, not to the whole row', async () => {
    await renderPage({ items: [buildTodo({ title: '할 일 A' }), buildTodo({ title: '할 일 B', dayOrder: 1 })] })

    const row = screen.getByRole('button', { name: '할 일 A 메뉴 열기' }).closest('li')!
    expect(row).not.toHaveAttribute('role')
    expect(row).not.toHaveAttribute('tabindex')
    const handle = screen.getByRole('button', { name: '할 일 A 순서 바꾸기' })
    expect(row).toContainElement(handle)
    expect(handle).toHaveAttribute('tabindex', '0')
    expect(handle).toHaveAttribute('aria-roledescription')
    // 스크린리더 안내는 한국어다
    const describedBy = handle.getAttribute('aria-describedby')
    expect(document.getElementById(describedBy!)).toHaveTextContent(/Space/)
    expect(document.getElementById(describedBy!)).toHaveTextContent(/방향키로 옮긴 뒤 Space로 놓아요/)
  })

  it('reorders with the keyboard: Space to pick up, ArrowDown to move, Space to drop', async () => {
    await renderPage({
      items: [
        buildTodo({ title: '할 일 A', dayOrder: 0 }),
        buildTodo({ title: '할 일 B', dayOrder: 1 }),
        buildTodo({ title: '할 일 C', dayOrder: 2 }),
      ],
    })
    // jsdom에는 레이아웃이 없어 행(li)을 50px 간격으로 쌓인 것처럼 잰다
    const original = Element.prototype.getBoundingClientRect
    Element.prototype.getBoundingClientRect = function (this: Element) {
      const make = (top: number, height: number) =>
        ({ top, bottom: top + height, left: 0, right: 300, width: 300, height, x: 0, y: top, toJSON: () => ({}) }) as DOMRect
      if (this.tagName === 'LI') {
        const rows = [...document.querySelectorAll('li')]
        return make(100 + rows.indexOf(this as HTMLLIElement) * 50, 50)
      }
      if (this.tagName === 'SECTION') return make(0, 1000)
      return make(0, 0)
    }
    onTestFinished(() => {
      Element.prototype.getBoundingClientRect = original
    })
    const fetchSpy = vi.spyOn(window, 'fetch')

    const handle = screen.getByRole('button', { name: '할 일 A 순서 바꾸기' })
    // 스크린리더 알림(dnd-kit 라이브 영역)은 id 대신 제목으로 읽는다
    const liveRegion = () => document.querySelector('[id^="DndLiveRegion"]')
    handle.focus()
    fireEvent.keyDown(handle, { code: 'Space', key: ' ' })
    await wait(50)
    expect(liveRegion()).toHaveTextContent(/할 일 A.*집었어요/)
    fireEvent.keyDown(document, { code: 'ArrowDown', key: 'ArrowDown' })
    await wait(50)
    expect(liveRegion()).toHaveTextContent(/'할 일 B' 자리로 옮겼어요/)
    fireEvent.keyDown(document, { code: 'Space', key: ' ' })
    await wait(700)
    expect(liveRegion()).toHaveTextContent(/할 일 A.*놓았어요/)

    const reorderCall = fetchSpy.mock.calls.find(([url, init]) => String(url).includes('/todos/reorder') && init?.method === 'PUT')
    expect(reorderCall).toBeDefined()
    expect(visibleTodoTitles()).toEqual(['할 일 B', '할 일 A', '할 일 C'])
  })

  // 빈 구간은 한 줄 행이어도 제자리의 끌어 놓을 자리(droppable)다. 키보드로 끌어 넣으면 행이 사라지지 않고 그 구간에 놓인다
  it('drops a todo into an empty one-line section with the keyboard, keeping the row rendered', async () => {
    await renderPage({
      items: [buildTodo({ title: '할 일 A', dayOrder: 0 }), buildTodo({ title: '할 일 B', dayOrder: 1 })],
    })
    expectSectionCompact('오전')
    // jsdom에는 레이아웃이 없어 미분류 구간(0–200)과 그 안의 행(100부터 50px), 아래 한 줄 행 구간(200부터 44px)을 잰다
    const original = Element.prototype.getBoundingClientRect
    Element.prototype.getBoundingClientRect = function (this: Element) {
      const make = (top: number, height: number) =>
        ({ top, bottom: top + height, left: 0, right: 300, width: 300, height, x: 0, y: top, toJSON: () => ({}) }) as DOMRect
      if (this.tagName === 'LI') {
        const rows = [...document.querySelectorAll('li')]
        return make(100 + rows.indexOf(this as HTMLLIElement) * 50, 50)
      }
      if (this.tagName === 'SECTION') {
        const sections = [...document.querySelectorAll('section')]
        const index = sections.indexOf(this as HTMLElement)
        return index === 0 ? make(0, 200) : make(200 + (index - 1) * 44, 44)
      }
      return make(0, 0)
    }
    onTestFinished(() => {
      Element.prototype.getBoundingClientRect = original
    })
    const fetchSpy = vi.spyOn(window, 'fetch')

    const handle = screen.getByRole('button', { name: '할 일 B 순서 바꾸기' })
    handle.focus()
    fireEvent.keyDown(handle, { code: 'Space', key: ' ' })
    await wait(50)
    fireEvent.keyDown(document, { code: 'ArrowDown', key: 'ArrowDown' })
    await wait(300)
    // 끄는 동안에도 행이 그려져 있다(구간이 한 줄 행이라 다른 곳에 따로 그려 두지 않는다)
    expect(screen.getByRole('button', { name: '할 일 B 순서 바꾸기' })).toBeInTheDocument()
    fireEvent.keyDown(document, { code: 'Space', key: ' ' })
    await wait(700)

    const reorderCall = fetchSpy.mock.calls.find(([url, init]) => String(url).includes('/todos/reorder') && init?.method === 'PUT')
    expect(reorderCall).toBeDefined()
    expect(JSON.parse(String(reorderCall![1]!.body)).items).toEqual(
      expect.arrayContaining([expect.objectContaining({ miniDay: 1 })]),
    )
    expectSectionExpanded('오전')
    const morning = getSectionToggleButton('오전', '접기').closest('section')!
    expect(within(morning).getByText('할 일 B')).toBeInTheDocument()
  })

  it('does not highlight anything when the only todo left is in another section', async () => {
    const first = buildTodo({ title: '할 일 A', miniDay: 0, timerMode: 'stopwatch' })
    const other = buildTodo({ title: '오전 할 일', miniDay: 1 })
    await renderPage({ items: [first, other] })
    openSection('오전')

    chooseTimer('할 일 A', '일반 타이머')
    await wait(100)
    // 아직 기록할 집중이 없어(100ms) 확인 없이 바로 완료한다(.impeccable.md §8)
    fireEvent.click(within(timerScreen()!).getByRole('button', { name: '완료' }))
    expect(screen.queryByRole('dialog', { name: '이 할 일을 완료할까요?' })).not.toBeInTheDocument()
    await wait(700)

    expect(timerScreen()).toBeNull()
    expect(document.querySelector('[data-highlighted]')).toBeNull()
  })

  it.each([
    ['running', { status: 'running' as const, focusStartedAt: 1 }],
    ['waiting', { status: 'waiting' as const }],
    ['paused', { status: 'paused' as const }],
  ])('opens a %s timer from the time line under the title without starting or resuming it', async (_label, state) => {
    const todo = buildTodo({ title: '할 일 A', timerMode: 'stopwatch' })
    await renderPage({ items: [todo] })
    const timer = { ...initialSingleTimerState, mode: 'stopwatch' as const, flexiblePhase: 'focus' as const, focusElapsedMs: 120_000, ...state }
    act(() => {
      useTimerStore.setState({ timers: { [todo.id as string]: timer } })
    })
    const startStopwatch = vi.spyOn(useTimerStore.getState(), 'startStopwatch')
    const resume = vi.spyOn(useTimerStore.getState(), 'resume')

    // 진행 중인 타이머가 있는 행에는 오른쪽 ▶가 없고, 시간 줄이 타이머로 가는 길이다
    expect(screen.queryByRole('button', { name: '할 일 A 집중 시작' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '할 일 A 타이머 화면 열기' }))
    await wait(100)

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(timerScreen()).not.toBeNull()
    expect(startStopwatch).not.toHaveBeenCalled()
    expect(resume).not.toHaveBeenCalled()
    expect(useTimerStore.getState().timers[todo.id as string]?.status).toBe(state.status)
  })

  it("still starts when another todo's timer is only paused", async () => {
    const mine = buildTodo({ title: '할 일 A', timerMode: 'stopwatch' })
    const other = buildTodo({ title: '은행 들르기', dayOrder: 1 })
    await renderPage({ items: [mine, other] })
    act(() => {
      useTimerStore.setState({ timers: { [other.id as string]: pausedStopwatch } })
    })

    chooseTimer('할 일 A', '일반 타이머')
    await wait(100)

    expect(useTimerStore.getState().timers[mine.id as string]).toMatchObject({ mode: 'stopwatch', status: 'running' })
    expect(timerScreen()).not.toBeNull()
  })

  it('keeps the row focus buttons disabled until the timer settings are loaded', async () => {
    server.use(http.get('/api/settings', async () => {
      await delay('infinite')
      return HttpResponse.json({})
    }))
    await renderPage({ items: [buildTodo({ title: '할 일 A' })] })

    const start = screen.getByRole('button', { name: '할 일 A 집중 시작' })
    expect(start).toBeDisabled()
    fireEvent.click(start)
    await wait(100)
    expect(timerScreen()).toBeNull()
  })

  it('shows an error when doing a todo again fails', async () => {
    await renderPage({ items: [buildTodo({ title: '끝낸 일', isDone: true })] })
    openSection('미분류')
    server.use(
      http.post('/api/todos', () => HttpResponse.json({ error: { message: 'boom' } }, { status: 500 })),
    )

    fireEvent.click(screen.getByText('끝낸 일'))
    fireEvent.click(screen.getByRole('button', { name: '내일 또 하기' }))
    await wait(700)

    expect(screen.getByText('할 일을 추가하지 못했어요. 다시 시도해 주세요.')).toBeInTheDocument()
  })

  it('leaves select mode when another date is picked', async () => {
    await renderPage({
      items: [
        buildTodo({ title: '9일 할 일' }),
        buildTodo({ title: '10일 할 일', date: '2026-01-10' }),
      ],
    })
    openSection('미분류')
    fireEvent.click(screen.getByRole('button', { name: '선택' }))
    fireEvent.click(screen.getByRole('button', { name: '9일 할 일 선택' }))

    fireEvent.click(screen.getByRole('button', { name: /^1월 10일 / }))

    // 선택 모드 머리 줄의 "취소"가 사라지고 "선택"으로 돌아온다
    expect(screen.queryByRole('button', { name: '취소' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '선택' })).toBeInTheDocument()
  })
})

describe('TodosPage coach mark', () => {
  const COACH_TEXT = /버튼으로 타이머를 골라 집중을 시작해요/

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
    act(() => {
      resetPendingDeletes()
    })
    vi.useRealTimers()
    window.localStorage.clear()
    act(() => {
      useAuthStore.setState(initialAuthStore, true)
      useTimerStore.setState({ timers: {}, pendingAutoSessions: {} })
    })
    vi.restoreAllMocks()
  })

  it('does not show the hint while there is no todo to start', async () => {
    await renderTodosPage({ items: [] })

    expect(screen.queryByText(COACH_TEXT)).not.toBeInTheDocument()
  })

  it('does not show the hint when every todo of the day is done (no start button on screen)', async () => {
    await renderTodosPage({ items: [buildTodo({ title: '끝낸 일', isDone: true })] })

    expect(screen.queryByText(COACH_TEXT)).not.toBeInTheDocument()
  })

  it('shows one hint while a start button is on screen, and remembers when it is closed', async () => {
    await renderTodosPage({ items: [buildTodo({ title: '할 일 하나' })] })

    expect(screen.getByRole('button', { name: '할 일 하나 집중 시작' })).toBeInTheDocument()
    expect(screen.getByText(COACH_TEXT)).toBeInTheDocument()
    // 목록 아래에 둔다. 달력과 목록 사이에 끼면 첫 할 일과 입력 줄이 밀린다(H1)
    expect(
      screen.getByText('할 일 하나').compareDocumentPosition(screen.getByText(COACH_TEXT)) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '힌트 닫기' }))

    expect(screen.queryByText(COACH_TEXT)).not.toBeInTheDocument()
    expect(window.localStorage.getItem(storageKeys.coachMarksSeen)).toContain('todos-intro')
  })

  // 코치마크는 목록 아래라 할 일이 많은 날에는 첫 화면 밖이다. 할 일이 2개 이하일 때만 띄운다
  it('waits for a day with few todos instead of showing the hint below a long list', async () => {
    await renderTodosPage({
      items: [buildTodo({ title: '하나' }), buildTodo({ title: '둘', dayOrder: 1 }), buildTodo({ title: '셋', dayOrder: 2 })],
    })

    expect(screen.getByRole('button', { name: '하나 집중 시작' })).toBeInTheDocument()
    expect(screen.queryByText(COACH_TEXT)).not.toBeInTheDocument()
    expect(window.localStorage.getItem(storageKeys.coachMarksSeen) ?? '').not.toContain('todos-intro')
  })

  it('hides the hint while the section with the todo is folded', async () => {
    await renderTodosPage({ items: [buildTodo({ title: '할 일 하나' })] })

    fireEvent.click(getSectionToggleButton('미분류', '접기'))

    expect(screen.queryByText(COACH_TEXT)).not.toBeInTheDocument()
  })
})
