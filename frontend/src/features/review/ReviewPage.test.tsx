import { Profiler } from 'react'
import { act, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import type { Todo } from '../../api/types'
import { defaultMiniDaysSettings } from '../../lib/miniDays'
import { server } from '../../mocks/server'
import { renderApp } from '../../test/renderApp'
import { initialSingleTimerState, useTimerStore } from '../timer/timerStore'
import { ReviewPage } from './ReviewPage'

const DATE = '2026-10-19'

function makeTodo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    title: '보고서 쓰기',
    note: null,
    date: DATE,
    miniDay: 0,
    dayOrder: 0,
    isDone: true,
    sessionCount: 1,
    sessionFocusSeconds: 1500,
    timerMode: 'stopwatch',
    createdAt: `${DATE}T00:00:00Z`,
    updatedAt: `${DATE}T00:00:00Z`,
    ...overrides,
  }
}

function mockApi(todos: Todo[]) {
  server.use(
    http.get('/api/todos', () => HttpResponse.json({ items: todos })),
    http.get('/api/settings/mini-days', () => HttpResponse.json(defaultMiniDaysSettings)),
    http.get('/api/reviews/:periodStart', () => new HttpResponse(null, { status: 204 })),
    http.get('/api/reviews', () => HttpResponse.json({ items: [] })),
  )
}

function startRunningTimer(todoId: string) {
  useTimerStore.setState({
    timers: {
      [todoId]: {
        ...initialSingleTimerState,
        mode: 'stopwatch',
        status: 'running',
        flexiblePhase: 'focus',
        focusStartedAt: Date.now(),
      },
    },
  })
}

describe('ReviewPage', () => {
  afterEach(() => {
    useTimerStore.setState({ timers: {} })
  })

  describe('타이머 실행 중 렌더링', () => {
    it('타이머가 째깍일 때마다 페이지를 다시 그리지 않는다', async () => {
      const todo = makeTodo()
      mockApi([todo])
      startRunningTimer(todo.id)
      let commits = 0
      renderApp(
        <Profiler id="review" onRender={() => { commits += 1 }}>
          <ReviewPage />
        </Profiler>,
        { route: `/review?period=daily&date=${DATE}` },
      )
      await screen.findByText('집중 기록')
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })

      const before = commits
      for (let i = 0; i < 4; i += 1) {
        act(() => useTimerStore.getState().tick())
      }

      expect(commits).toBe(before)
    })

    it('실행 중인 할 일은 아직 완료로 세지 않는다', async () => {
      const todo = makeTodo()
      mockApi([todo])
      startRunningTimer(todo.id)
      renderApp(<ReviewPage />, { route: `/review?period=daily&date=${DATE}` })

      expect(await screen.findByText('0개')).toBeInTheDocument()
    })
  })
})
