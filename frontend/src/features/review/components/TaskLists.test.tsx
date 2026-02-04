import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CompletedTaskList } from './CompletedTaskList'
import { IncompleteTasks } from './IncompleteTasks'

const item = {
  id: 'task-1',
  title: '리뷰 태스크',
  date: '2026-01-09',
  isDone: true,
  focusSeconds: 600,
  focusTime: '10분',
  flowCount: 1,
  miniDay: 1,
}

describe('review task lists', () => {
  it('renders formatted date labels when enabled', () => {
    render(
      <CompletedTaskList
        items={[item]}
        showDate
        formatDateLabel={() => '01.09 (금)'}
      />,
    )

    expect(screen.getByText('01.09 (금)')).toBeInTheDocument()
  })

  it('keeps daily mode compact when date labels are disabled', () => {
    render(
      <IncompleteTasks
        items={[{ ...item, isDone: false }]}
        showDate={false}
        formatDateLabel={() => '01.09 (금)'}
      />,
    )

    expect(screen.queryByText('01.09 (금)')).not.toBeInTheDocument()
  })
})
