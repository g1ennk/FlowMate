import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Todo } from '../../../api/types'
import { DEFAULT_POMODORO_SETTINGS, initialSingleTimerState } from '../../timer/timerDefaults'
import { useTimerStore } from '../../timer/timerStore'
import type { TimerStatus } from '../../timer/timerTypes'
import { TodoMenuSheet } from './TodoMenuSheet'

const todo: Todo = {
  id: '11111111-1111-4111-8111-111111111111',
  title: '타이머 메뉴 테스트',
  note: null,
  date: '2026-10-19',
  miniDay: 1,
  dayOrder: 0,
  isDone: false,
  sessionCount: 0,
  sessionFocusSeconds: 0,
  timerMode: 'stopwatch',
  createdAt: '2026-10-19T00:00:00Z',
  updatedAt: '2026-10-19T00:00:00Z',
}

function setStopwatchTimer(status: TimerStatus) {
  useTimerStore.setState({
    timers: {
      [todo.id]: {
        ...initialSingleTimerState,
        mode: 'stopwatch',
        status,
        flexiblePhase: 'focus',
        focusElapsedMs: 10 * 60_000,
        settingsSnapshot: DEFAULT_POMODORO_SETTINGS,
      },
    },
    pendingAutoSessions: {},
  })
}

function renderMenu() {
  const onOpenTimer = vi.fn()
  const setTimerErrorMessage = vi.fn()
  render(
    <TodoMenuSheet
      selectedTodo={todo}
      showNoteModal={false}
      todayDateKey="2026-10-19"
      onClose={vi.fn()}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      onOpenNote={vi.fn()}
      onOpenTimer={onOpenTimer}
      onTodoDateAction={vi.fn()}
      setTimerErrorMessage={setTimerErrorMessage}
    />,
  )
  return { onOpenTimer, setTimerErrorMessage }
}

describe('TodoMenuSheet 타이머 모드 선택', () => {
  afterEach(() => {
    useTimerStore.getState().clearAll()
  })

  it.each<TimerStatus>(['paused', 'waiting'])(
    '일반 타이머가 %s 상태면 뽀모도로를 고를 수 없고 이유를 보여준다',
    async (status) => {
      const user = userEvent.setup()
      setStopwatchTimer(status)

      const { onOpenTimer } = renderMenu()

      const pomodoroButton = screen.getByRole('button', { name: '뽀모도로 타이머' })
      expect(pomodoroButton).toBeDisabled()
      expect(screen.getByText('같은 태스크에 멈춘 일반 타이머가 있어요. 리셋한 뒤 바꿀 수 있어요')).toBeInTheDocument()

      await user.click(pomodoroButton)
      expect(onOpenTimer).not.toHaveBeenCalled()
    },
  )

  it('일시정지한 일반 타이머는 같은 모드로 다시 열 수 있다', async () => {
    const user = userEvent.setup()
    setStopwatchTimer('paused')

    const { onOpenTimer } = renderMenu()

    await user.click(screen.getByRole('button', { name: '일반 타이머' }))
    expect(onOpenTimer).toHaveBeenCalledWith(todo, 'stopwatch')
  })

  it('타이머가 시작 전(idle)이면 다른 모드를 고를 수 있다', async () => {
    const user = userEvent.setup()
    setStopwatchTimer('idle')

    const { onOpenTimer } = renderMenu()

    await user.click(screen.getByRole('button', { name: '뽀모도로 타이머' }))
    expect(onOpenTimer).toHaveBeenCalledWith(todo, 'pomodoro')
  })
})
