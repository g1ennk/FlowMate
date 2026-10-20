import { Profiler } from 'react'
import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { onlineManager } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, onTestFinished } from 'vitest'
import type { Todo } from '../../api/types'
import { defaultMiniDaysSettings } from '../../lib/miniDays'
import { formatDateKey } from '../../lib/time'
import { server } from '../../mocks/server'
import { renderApp } from '../../test/renderApp'
import { initialSingleTimerState, useTimerStore } from '../timer/timerStore'
import { ReviewPage } from './ReviewPage'
import { formatPeriodLabel, parseDateKey } from './reviewUtils'

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

  describe('지난 기간과 불러오기 실패', () => {
    const PAST = '2026-09-02'

    it('오늘이 아닌 날에는 "오늘" 문구를 쓰지 않는다', async () => {
      mockApi([])
      renderApp(<ReviewPage />, { route: `/review?period=daily&date=${PAST}` })

      expect(await screen.findByText('일간 회고')).toBeInTheDocument()
      expect(screen.getByText('할 일')).toBeInTheDocument()
      expect(screen.getByText('이 기간에는 집중 기록이 없어요')).toBeInTheDocument()
      expect(screen.queryByText('오늘 회고')).not.toBeInTheDocument()
      expect(screen.queryByText('오늘의 할 일')).not.toBeInTheDocument()
    })

    it('오늘에는 "오늘" 문구를 쓴다', async () => {
      mockApi([])
      renderApp(<ReviewPage />, {
        route: `/review?period=daily&date=${formatDateKey(new Date())}`,
      })

      expect(await screen.findByText('오늘 회고')).toBeInTheDocument()
      expect(screen.getByText('오늘의 할 일')).toBeInTheDocument()
    })

    it('탭을 바꿔도 보고 있던 날짜를 유지한다', async () => {
      mockApi([])
      const user = userEvent.setup()
      renderApp(<ReviewPage />, { route: `/review?period=daily&date=${PAST}` })
      await screen.findByText('일간 회고')

      await user.click(screen.getByRole('radio', { name: '주간' }))

      expect(
        await screen.findByText(formatPeriodLabel('weekly', parseDateKey(PAST))),
      ).toBeInTheDocument()
    })

    it('오프라인으로 열면 기록이 0건처럼 보이지 않게 오프라인이라 못 불러왔다고 알리고, 연결되면 불러온다', async () => {
      mockApi([makeTodo({ date: PAST, isDone: true })])
      onlineManager.setOnline(false)
      onTestFinished(() => onlineManager.setOnline(true))
      renderApp(<ReviewPage />, { route: `/review?period=daily&date=${PAST}` })

      // 회고와 기록이 둘 다 기다리는 중이면 같은 말을 두 줄로 하지 않고 한 줄로 알린다
      expect(await screen.findByText('오프라인이라 회고와 기록을 불러오지 못했어요. 연결되면 다시 불러와요.')).toBeInTheDocument()
      expect(screen.getAllByRole('status').filter((el) => /오프라인이라/.test(el.textContent ?? ''))).toHaveLength(1)
      expect(screen.queryByText('이 기간에는 집중 기록이 없어요')).not.toBeInTheDocument()
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()

      act(() => onlineManager.setOnline(true))
      expect(await screen.findByText('1개')).toBeInTheDocument()
    })

    it('기록을 불러오지 못하면 빈 기록 대신 실패를 알리고 다시 시도할 수 있다', async () => {
      let fail = true
      mockApi([])
      server.use(
        http.get('/api/todos', () =>
          fail
            ? HttpResponse.json({ error: { message: 'boom' } }, { status: 500 })
            : HttpResponse.json({ items: [makeTodo({ date: PAST, isDone: true })] }),
        ),
      )
      const user = userEvent.setup()
      renderApp(<ReviewPage />, { route: `/review?period=daily&date=${PAST}` })

      expect(await screen.findByText('기록을 불러오지 못했어요')).toBeInTheDocument()
      expect(screen.queryByText('이 기간에는 집중 기록이 없어요')).not.toBeInTheDocument()

      fail = false
      await user.click(screen.getByRole('button', { name: '다시 시도' }))
      expect(await screen.findByText('1개')).toBeInTheDocument()
    })
  })
  describe('화면 구성', () => {
    function isBefore(a: Element, b: Element) {
      return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    }

    it('머리 → 기간 → 통계 → 할 일 기록 → 회고 입력 순서다(한 일을 다 보고 쓴다)', async () => {
      mockApi([makeTodo()])
      renderApp(<ReviewPage />, { route: `/review?period=daily&date=${DATE}` })

      const textarea = await screen.findByRole('textbox')
      const order = [
        screen.getByRole('heading', { level: 1, name: '회고' }),
        screen.getByRole('radio', { name: '일간' }),
        screen.getByText('집중 기록'),
        screen.getByText('할 일'),
        textarea,
      ]
      order.slice(1).forEach((el, i) => expect(isBefore(order[i], el)).toBe(true))
    })

    it('회고 입력 placeholder는 그날의 실제 기록으로 만든다', async () => {
      mockApi([makeTodo({ sessionCount: 3 })])
      renderApp(<ReviewPage />, { route: `/review?period=daily&date=${DATE}` })

      await waitFor(() =>
        expect(screen.getByRole('textbox')).toHaveAttribute('placeholder', '이날 집중 3회, 할 일 1개를 끝냈어요. 어땠어요?'),
      )
    })

    it('지난 기간 회고, 회고 목록, AI 리포트를 미리 불러오지 않는다', async () => {
      const reviewStarts: string[] = []
      let listCalls = 0
      let aiCalls = 0
      mockApi([])
      server.use(
        http.get('/api/reviews/:periodStart', ({ params }) => {
          reviewStarts.push(params.periodStart as string)
          return new HttpResponse(null, { status: 204 })
        }),
        http.get('/api/reviews', () => {
          listCalls += 1
          return HttpResponse.json({ items: [] })
        }),
        http.get('/api/ai/report', () => {
          aiCalls += 1
          return new HttpResponse(null, { status: 204 })
        }),
      )
      renderApp(<ReviewPage />, { route: `/review?period=daily&date=${DATE}` })
      await screen.findByRole('textbox')
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })

      expect(new Set(reviewStarts)).toEqual(new Set([DATE]))
      expect(listCalls).toBe(0)
      expect(aiCalls).toBe(0)
    })
  })
  describe('카드 묶음', () => {
    const PAST = '2026-09-15'
    // 화면의 묶음마다 둥근 카드 한 장에 담긴다. 서로 다른 카드여야 한다
    function expectEachInOwnCard(elements: Element[]) {
      const cards = elements.map((el) => el.closest('.rounded-card'))
      cards.forEach((card) => {
        expect(card).not.toBeNull()
        expect(card).toHaveClass('border-card-border', 'bg-surface-card', 'p-card')
      })
      expect(new Set(cards).size).toBe(cards.length)
    }

    it('날짜 이동이 위, 기간 고르기가 아래로 카드 한 장에 함께 담기고 사이를 선으로 나눈다', async () => {
      mockApi([makeTodo({ date: PAST })])
      renderApp(<ReviewPage />, { route: `/review?period=daily&date=${PAST}` })
      await screen.findByRole('textbox')

      const tabsCard = screen.getByRole('radio', { name: '일간' }).closest('.rounded-card')
      const navCard = screen.getByRole('button', { name: '이전 날' }).closest('.rounded-card')
      expect(tabsCard).not.toBeNull()
      expect(navCard).toBe(tabsCard)
      expect(screen.getByRole('radio', { name: '일간' }).closest('.border-t')).toHaveClass('border-border-subtle')
      const prev = screen.getByRole('button', { name: '이전 날' })
      expect(prev.compareDocumentPosition(screen.getByRole('radio', { name: '일간' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('일간: 기간 카드, 회고 입력, 집중 기록, 할 일이 각각 카드다', async () => {
      mockApi([makeTodo({ date: PAST })])
      renderApp(<ReviewPage />, { route: `/review?period=daily&date=${PAST}` })

      const textarea = await screen.findByRole('textbox')
      expectEachInOwnCard([
        screen.getByRole('button', { name: '이전 날' }),
        textarea,
        screen.getByText('집중 시간'),
        screen.getByRole('button', { name: /보고서 쓰기/ }),
      ])
      // 섹션 제목은 카드 밖에 둔다(집중 기록과 같다)
      expect(screen.getByRole('heading', { name: '일간 회고' }).closest('.rounded-card')).toBeNull()
    })

    it('일간 빈 날: 빈 상태도 카드에 담긴다', async () => {
      mockApi([])
      renderApp(<ReviewPage />, { route: `/review?period=daily&date=${PAST}` })

      const textarea = await screen.findByRole('textbox')
      expectEachInOwnCard([
        textarea,
        screen.getByText('이 기간에는 집중 기록이 없어요'),
        screen.getByText('이날은 할 일이 없어요'),
      ])
    })

    it('주간과 월간: 할 일 기록과 빈 상태도 카드다', async () => {
      mockApi([makeTodo({ date: PAST })])
      const { unmount } = renderApp(<ReviewPage />, { route: `/review?period=weekly&date=${PAST}` })
      const textarea = await screen.findByRole('textbox')
      expectEachInOwnCard([
        screen.getByRole('button', { name: '이전 주' }),
        textarea,
        screen.getByText('집중 시간'),
        screen.getByRole('button', { name: /보고서 쓰기/ }),
      ])
      unmount()

      renderApp(<ReviewPage />, { route: '/review?period=monthly&date=2026-08-10' })
      await screen.findByRole('textbox')
      expectEachInOwnCard([
        screen.getByRole('button', { name: '이전 달' }),
        screen.getByText('이 기간에는 집중 기록이 없어요'),
        screen.getByText('이 기간에는 할 일 기록이 없어요'),
      ])
    })

    it('불러오기 실패 알림도 카드에 담긴다', async () => {
      mockApi([])
      server.use(http.get('/api/todos', () => HttpResponse.json({ error: { message: 'boom' } }, { status: 500 })))
      renderApp(<ReviewPage />, { route: `/review?period=daily&date=${PAST}` })

      expectEachInOwnCard([await screen.findByText('기록을 불러오지 못했어요')])
    })
  })

  describe('통계 비교', () => {
    it('진행 중인 오늘은 어제 전체와 비교하지 않고, 끝난 날은 칸마다 증감을 붙이고 비교 대상을 읽어 준다', async () => {
      const today = formatDateKey(new Date())
      const yesterdayDate = new Date()
      yesterdayDate.setDate(yesterdayDate.getDate() - 1)
      const yesterday = formatDateKey(yesterdayDate)
      mockApi([
        makeTodo({ id: '11111111-1111-4111-8111-111111111111', date: today, sessionFocusSeconds: 1500 }),
        makeTodo({ id: '22222222-2222-4222-8222-222222222222', date: yesterday, sessionFocusSeconds: 4800, sessionCount: 2 }),
      ])
      const { unmount } = renderApp(<ReviewPage />, { route: `/review?period=daily&date=${today}` })
      await screen.findAllByText('25분')
      expect(screen.queryByText(/보다/)).not.toBeInTheDocument()
      unmount()

      renderApp(<ReviewPage />, { route: `/review?period=daily&date=${yesterday}` })
      expect(await screen.findByText('+1시간 20분')).toBeInTheDocument()
      expect(screen.getByText('전날보다 집중 시간 1시간 20분 늘었어요')).toHaveClass('sr-only')
      expect(screen.getByText('전날보다 집중 횟수 2회 늘었어요')).toBeInTheDocument()
    })
  })
})
