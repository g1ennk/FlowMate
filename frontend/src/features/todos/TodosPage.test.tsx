import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { storageKeys } from '../../lib/storageKeys'
import { renderApp } from '../../test/renderApp'
import { useTimerStore } from '../timer/timerStore'
import TodosPage from './TodosPage'

const selectedDateKey = '2026-01-09'
const existingTodoId = '11111111-1111-4111-8111-111111111111'

function buildTodo(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: existingTodoId,
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

describe('TodosPage', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    useTimerStore.setState({ timers: {}, pendingAutoSessions: {} })
  })

  afterEach(() => {
    useTimerStore.setState({ timers: {}, pendingAutoSessions: {} })
  })

  it('renders, creates, completes, and deletes todos in the main flow', async () => {
    const user = userEvent.setup()
    seedTodos([buildTodo()])

    renderApp(
      <Routes>
        <Route path="/todos" element={<TodosPage />} />
      </Routes>,
      { route: `/todos?date=${selectedDateKey}` },
    )

    expect(await screen.findByText('기존 할 일')).toBeInTheDocument()
    expect(screen.getByText('1월 9일')).toBeInTheDocument()
    expect(screen.getByText('미분류')).toBeInTheDocument()

    await user.click(screen.getByLabelText('미분류 할 일 추가'))
    await user.type(await screen.findByPlaceholderText('할 일을 입력하세요'), '새 할 일{enter}')

    expect(await screen.findByText('새 할 일')).toBeInTheDocument()
    expect(screen.getByText('남음 2 · 완료 0')).toBeInTheDocument()

    const newTodoTitle = screen.getByText('새 할 일')
    const toggleButton = newTodoTitle.parentElement?.previousElementSibling
    expect(toggleButton).toBeInstanceOf(HTMLButtonElement)

    await user.click(toggleButton as HTMLButtonElement)

    await waitFor(() => {
      expect(screen.getByText('남음 1 · 완료 1')).toBeInTheDocument()
    })

    await user.click(screen.getByText('기존 할 일'))
    await user.click(await screen.findByRole('button', { name: '삭제하기' }))

    await waitFor(() => {
      expect(screen.queryByText('기존 할 일')).not.toBeInTheDocument()
    })
  })
})
