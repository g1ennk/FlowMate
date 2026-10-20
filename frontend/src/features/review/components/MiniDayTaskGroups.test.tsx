import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { TaskItem } from '../reviewTypes'
import { MiniDayTaskGroups } from './MiniDayTaskGroups'

const MINI_DAYS = [
  { id: 0, label: '미분류' },
  { id: 1, label: '오전' },
  { id: 2, label: '오후' },
  { id: 3, label: '저녁' },
]

function task(id: string, miniDay: number): TaskItem {
  return { id, title: id, date: '2026-10-19', isDone: false, focusSeconds: 0, focusTime: '0분', flowCount: 0, miniDay }
}

describe('MiniDayTaskGroups', () => {
  it('묶음 머리는 카드 왼쪽 끝(체크 열)에서 시작하는 작은 라벨과, 오른쪽 끝까지 이어지는 또렷한 가로선이다', () => {
    render(<MiniDayTaskGroups tasks={[task('보고서', 1), task('운동', 2)]} miniDayLabels={MINI_DAYS} />)

    const label = screen.getByText('오전')
    expect(label).toHaveClass('text-xs', 'font-medium', 'text-text-secondary')
    const rule = label.nextElementSibling
    expect(rule).toHaveAttribute('aria-hidden', 'true')
    expect(rule).toHaveClass('h-px', 'flex-1', 'bg-border-default')
    // 할 일 글자 열(pl-10)보다 왼쪽, 카드 안쪽 여백 선에서 시작해 묶음이 확실히 나뉜다
    expect(label.parentElement).not.toHaveClass('pl-10')
  })

  it('묶음 안 할 일 행 사이에는 선을 따로 긋지 않는다', () => {
    render(<MiniDayTaskGroups tasks={[task('보고서', 1), task('독서', 1)]} miniDayLabels={MINI_DAYS} />)

    for (const name of ['보고서', '독서']) {
      expect(screen.getByText(name).closest('[data-list-row-body]')).not.toHaveClass('border-t')
    }
  })
})
