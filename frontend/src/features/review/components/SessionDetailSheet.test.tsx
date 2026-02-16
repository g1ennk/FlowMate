import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TaskItem } from '../reviewTypes'
import { SessionDetailSheet } from './SessionDetailSheet'
import { useTodoSessions } from '../../todos/hooks'

vi.mock('../../todos/hooks', () => ({
  useTodoSessions: vi.fn(),
}))

const mockedUseTodoSessions = vi.mocked(useTodoSessions)

const task: TaskItem = {
  id: 'todo-1',
  title: '세션 테스트',
  date: '2026-01-09',
  isDone: false,
  focusSeconds: 1500,
  focusTime: '25분',
  flowCount: 2,
  miniDay: 1,
}

describe('SessionDetailSheet', () => {
  beforeEach(() => {
    mockedUseTodoSessions.mockReset()
  })

  it('renders loading state while fetching sessions', () => {
    mockedUseTodoSessions.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as unknown as ReturnType<typeof useTodoSessions>)

    render(<SessionDetailSheet task={task} isOpen onClose={() => {}} />)

    expect(mockedUseTodoSessions).toHaveBeenCalledWith(task.id, true)
    expect(screen.getByText('세션 기록 불러오는 중...')).toBeInTheDocument()
  })

  it('renders error state without local fallback', () => {
    mockedUseTodoSessions.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as unknown as ReturnType<typeof useTodoSessions>)

    render(<SessionDetailSheet task={task} isOpen onClose={() => {}} />)

    expect(screen.getByText('세션 목록을 불러오지 못했습니다.')).toBeInTheDocument()
    expect(screen.queryByText('기록된 세션이 없어요.')).not.toBeInTheDocument()
  })

  it('renders server session list on success', () => {
    mockedUseTodoSessions.mockReturnValue({
      data: {
        items: [
          {
            id: 'session-1',
            todoId: task.id,
            sessionFocusSeconds: 1500,
            breakSeconds: 300,
            sessionOrder: 1,
            createdAt: '2026-01-09T00:00:00.000Z',
          },
          {
            id: 'session-2',
            todoId: task.id,
            sessionFocusSeconds: 1200,
            breakSeconds: 0,
            sessionOrder: 2,
            createdAt: '2026-01-09T01:00:00.000Z',
          },
        ],
      },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useTodoSessions>)

    render(<SessionDetailSheet task={task} isOpen onClose={() => {}} />)

    expect(screen.getByText('Flow 1')).toBeInTheDocument()
    expect(screen.getByText('Flow 2')).toBeInTheDocument()
    expect(screen.getByText('휴식 5분')).toBeInTheDocument()
    expect(screen.getByText('휴식 없음')).toBeInTheDocument()
  })
})
