import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TimerCycleDots } from './TimerCycleDots'

describe('TimerCycleDots', () => {
  it('완료는 채운 점, 남음은 테두리만 있는 빈 점(○)이다(§2-2)', () => {
    render(<TimerCycleDots dots={['done', { progress: 40 }, 'todo']} tone="focus" label="집중 3회 중 1회 완료" />)

    const group = screen.getByRole('img', { name: '집중 3회 중 1회 완료' })
    const done = group.querySelector('[data-dot="done"]')
    const todo = group.querySelector('[data-dot="todo"]')
    expect(done).toHaveClass('bg-timer-accent')
    expect(todo).toHaveClass('border')
    expect(todo?.className).not.toMatch(/(^|\s)bg-/)
  })
})
