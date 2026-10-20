import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { onlineManager } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { server } from '../../../mocks/server'
import { renderApp } from '../../../test/renderApp'
import type { TaskItem } from '../reviewTypes'
import { SessionDetailSheet } from './SessionDetailSheet'

const TODO_ID = '11111111-1111-4111-8111-111111111111'

function makeTask(overrides: Partial<TaskItem> = {}): TaskItem {
  return { id: TODO_ID, title: '보고서 쓰기', date: '2026-10-19', isDone: true, focusSeconds: 0, focusTime: '0분', flowCount: 0, miniDay: 0, ...overrides }
}

function mockSessions(items: unknown[]) {
  server.use(http.get('/api/todos/:id/sessions', () => HttpResponse.json({ items })))
}

describe('SessionDetailSheet', () => {
  it('날짜는 "10월 19일"로 쓰고, 값이 없으면 "-", 0회는 흐린 글자다', async () => {
    mockSessions([])
    const year = new Date().getFullYear()
    renderApp(<SessionDetailSheet task={makeTask({ date: `${year}-10-19` })} isOpen onClose={vi.fn()} />)

    expect(await screen.findByText('10월 19일')).toBeInTheDocument()
    expect(screen.getAllByText('-')).toHaveLength(2)
    expect(screen.getByText('0회')).toHaveClass('text-text-tertiary')
    expect(await screen.findByText('아직 세션 기록이 없어요')).toBeInTheDocument()
  })

  it('오프라인이면 "아직 세션 기록이 없어요" 대신 오프라인이라 못 불러왔다고 알린다', async () => {
    mockSessions([])
    onlineManager.setOnline(false)
    try {
      renderApp(<SessionDetailSheet task={makeTask()} isOpen onClose={vi.fn()} />)

      expect(await screen.findByText('오프라인이라 세션 기록을 불러오지 못했어요. 연결되면 다시 불러와요.')).toBeInTheDocument()
      expect(screen.queryByText('아직 세션 기록이 없어요')).not.toBeInTheDocument()
    } finally {
      onlineManager.setOnline(true)
    }
  })

  it('세션이 있으면 숫자(점 없이)와 가장 긴 집중을 상자 없이 보여 준다', async () => {
    mockSessions([
      { id: '22222222-2222-4222-8222-222222222222', todoId: TODO_ID, sessionFocusSeconds: 1500, breakSeconds: 300, sessionOrder: 1, createdAt: '2026-10-19T11:00:00Z' },
      { id: '33333333-3333-4333-8333-333333333333', todoId: TODO_ID, sessionFocusSeconds: 1800, breakSeconds: 0, sessionOrder: 2, createdAt: '2026-10-19T12:00:00Z' },
    ])
    const { container } = renderApp(<SessionDetailSheet task={makeTask({ flowCount: 2, focusSeconds: 3300, focusTime: '55분' })} isOpen onClose={vi.fn()} />)

    expect(await screen.findByText('가장 긴 집중 30분, 휴식 비율 9%')).toBeInTheDocument()
    // 핵심 숫자(총 집중, 집중 횟수)는 초록(accent-text)으로 굵게 크게, 휴식은 무채색 그대로(사용자 결정 2026-10-20)
    expect(screen.getByText('55분')).toHaveClass('text-accent-text', 'font-light', 'text-3xl')
    expect(screen.getByText('2회')).toHaveClass('text-accent-text', 'font-light', 'text-3xl')
    expect(screen.getByText('5분')).toHaveClass('text-text-primary')
    expect(screen.getByText('5분')).not.toHaveClass('text-accent-text')
    // 집중 횟수는 숫자만 쓴다(사용자 결정 2026-10-20: 점 제거)
    expect(document.querySelectorAll('[data-focus-dot]')).toHaveLength(0)
    expect(screen.getByText('집중 1')).toBeInTheDocument()
    expect(container.ownerDocument.querySelector('[role=dialog] .rounded-2xl, [role=dialog] .rounded-xl')).toBeNull()
  })

  it('세션 목록 제목은 SectionHeader(h3)이고, 비어 있으면 EmptyState 한 줄이다', async () => {
    mockSessions([])
    renderApp(<SessionDetailSheet task={makeTask()} isOpen onClose={vi.fn()} />)

    expect(screen.getByRole('heading', { level: 3, name: '세션 기록' })).toBeInTheDocument()
    expect(await screen.findByText('아직 세션 기록이 없어요')).toHaveClass('text-text-secondary')
  })

  it('불러오지 못하면 상자 없는 한 줄 안내와 다시 시도를 두고, 누르면 다시 불러온다', async () => {
    let calls = 0
    server.use(http.get('/api/todos/:id/sessions', () => {
      calls += 1
      return calls === 1
        ? HttpResponse.json({ error: { code: 'X', message: 'x' } }, { status: 500 })
        : HttpResponse.json({ items: [] })
    }))
    const user = userEvent.setup()
    renderApp(<SessionDetailSheet task={makeTask()} isOpen onClose={vi.fn()} />)

    const alert = await screen.findByRole('alert', {}, { timeout: 4000 })
    expect(alert).toHaveTextContent('세션 기록을 불러오지 못했어요')
    await user.click(screen.getByRole('button', { name: '다시 시도' }))

    expect(await screen.findByText('아직 세션 기록이 없어요')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
