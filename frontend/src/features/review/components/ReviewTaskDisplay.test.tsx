import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderApp } from '../../../test/renderApp'
import type { TaskItem } from '../reviewTypes'
import { CompletedTaskList } from './CompletedTaskList'
import { HighlightTask } from './HighlightTask'
import { IncompleteTasks } from './IncompleteTasks'
import { SessionDetailSheet } from './SessionDetailSheet'
import { TimelineTaskItem } from './TimelineTaskItem'

vi.mock('../../todos/hooks', () => ({
  useTodoSessions: () => ({
    data: { items: [] },
    isLoading: false,
    isError: false,
  }),
}))

const makeTask = (overrides: Partial<TaskItem> = {}): TaskItem => ({
  id: '00000000-0000-4000-8000-000000000001',
  title: '운영체제 정리',
  reviewRound: null,
  date: '2026-03-21',
  isDone: false,
  focusSeconds: 0,
  focusTime: '0분',
  flowCount: 1,
  miniDay: 0,
  ...overrides,
})

describe('review task display', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('distinguishes same base titles by reviewRound while preserving stored titles', () => {
    renderApp(
      <>
        <TimelineTaskItem
          item={makeTask({
            id: '00000000-0000-4000-8000-000000000011',
            title: '[복습 1회] 운영체제 정리',
            reviewRound: 1,
          })}
        />
        <TimelineTaskItem
          item={makeTask({
            id: '00000000-0000-4000-8000-000000000012',
            title: '[복습 2회] 운영체제 정리',
            reviewRound: 2,
          })}
        />
      </>,
    )

    expect(screen.getByText('[복습 1회] 운영체제 정리')).toBeInTheDocument()
    expect(screen.getByText('[복습 2회] 운영체제 정리')).toBeInTheDocument()
    expect(screen.getByText('복습 1회')).toBeInTheDocument()
    expect(screen.getByText('복습 2회')).toBeInTheDocument()
  })

  it('shows terminal and active sixth-round badges while preserving stored titles', () => {
    renderApp(
      <>
        <CompletedTaskList
          items={[
            makeTask({
              id: '00000000-0000-4000-8000-000000000021',
              title: '[복습 6회] 마지막 복습',
              reviewRound: 6,
              isDone: true,
            }),
          ]}
        />
        <IncompleteTasks
          items={[
            makeTask({
              id: '00000000-0000-4000-8000-000000000022',
              title: '[복습 6회] 다음 복습',
              reviewRound: 6,
              isDone: false,
            }),
          ]}
        />
      </>,
    )

    expect(screen.getByText('[복습 6회] 마지막 복습')).toBeInTheDocument()
    expect(screen.getByText('[복습 6회] 다음 복습')).toBeInTheDocument()
    expect(screen.getByText('복습 완료')).toBeInTheDocument()
    expect(screen.getByText('복습 6회')).toBeInTheDocument()
  })

  it('renders review badges consistently in highlight and session detail', () => {
    const task = makeTask({
      id: '00000000-0000-4000-8000-000000000031',
      title: '[복습 2회] 자료구조 복기',
      reviewRound: 2,
      isDone: true,
      focusSeconds: 3_600,
      focusTime: '1시간',
    })

    renderApp(
      <>
        <HighlightTask title="하이라이트" task={task} />
        <SessionDetailSheet task={task} isOpen onClose={() => {}} />
      </>,
    )

    expect(screen.getAllByText('[복습 2회] 자료구조 복기').length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText('복습 2회').length).toBeGreaterThanOrEqual(2)
  })
})
