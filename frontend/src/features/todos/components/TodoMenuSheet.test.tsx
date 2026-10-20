import { act, fireEvent, render, screen } from '@testing-library/react'
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

function renderMenu(selectedTodo: Todo = todo, handlers: { onEdit?: () => void; onDelete?: () => void } = {}) {
  const onOpenTimer = vi.fn()
  const showTimerError = vi.fn()
  render(
    <TodoMenuSheet
      selectedTodo={selectedTodo}
      showNoteModal={false}
      todayDateKey="2026-10-19"
      onClose={vi.fn()}
      onEdit={handlers.onEdit ?? vi.fn()}
      onDelete={handlers.onDelete ?? vi.fn()}
      onOpenNote={vi.fn()}
      onOpenTimer={onOpenTimer}
      onTodoDateAction={vi.fn()}
      showTimerError={showTimerError}
      getTodoTitle={(id) => (id === 'other' ? '은행 들르기' : undefined)}
    />,
  )
  return { onOpenTimer, showTimerError }
}

describe('TodoMenuSheet 타이머 모드 선택', () => {
  afterEach(() => {
    // 열린 메뉴가 타이머를 구독하고 있어 act 안에서 비운다
    act(() => useTimerStore.getState().clearAll())
  })

  it.each<TimerStatus>(['paused', 'waiting'])(
    '일반 타이머가 %s 상태면 뽀모도로를 고를 수 없고 이유를 보여준다',
    async (status) => {
      const user = userEvent.setup()
      setStopwatchTimer(status)

      const { onOpenTimer } = renderMenu()

      const pomodoroButton = screen.getByRole('button', { name: '뽀모도로 타이머' })
      expect(pomodoroButton).toBeDisabled()
      expect(screen.getByText('같은 할 일에 멈춘 일반 타이머가 있어요. 초기화한 뒤 바꿀 수 있어요')).toBeInTheDocument()

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

describe('TodoMenuSheet 구성', () => {
  afterEach(() => {
    // 열린 메뉴가 타이머를 구독하고 있어 act 안에서 비운다
    act(() => useTimerStore.getState().clearAll())
  })

  it('수정과 삭제는 제목 줄 양옆 글자 버튼이고(왼쪽 파란 수정, 오른쪽 빨간 삭제), 아래 목록은 타이머, 메모, 날짜만 둔다', () => {
    const onEdit = vi.fn()
    const onDelete = vi.fn()
    renderMenu(todo, { onEdit, onDelete })

    const heading = screen.getByRole('heading', { name: todo.title })
    const header = heading.parentElement!
    const edit = screen.getByRole('button', { name: `${todo.title} 수정` })
    const remove = screen.getByRole('button', { name: `${todo.title} 삭제` })
    expect(header).toContainElement(edit)
    expect(header).toContainElement(remove)
    expect(edit).toHaveTextContent(/^수정$/)
    expect(remove).toHaveTextContent(/^삭제$/)
    expect(edit.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(heading.compareDocumentPosition(remove) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(remove).toHaveClass('text-state-error-text')
    expect(edit).toHaveClass('text-state-info-text')

    const listNames = screen
      .getAllByRole('button')
      .filter((button) => !header.contains(button))
      .map((button) => button.textContent?.trim())
      .filter((name) => name)
    // 끝의 '닫기'는 시트가 두는 스크린리더용 닫기 버튼이다
    expect(listNames).toEqual(['일반 타이머', '뽀모도로 타이머', '메모', '내일 하기', '날짜 바꾸기', '닫기'])
    expect(screen.queryByRole('separator')).not.toBeInTheDocument()

    fireEvent.click(edit)
    expect(onEdit).toHaveBeenCalledWith(todo.id, todo.title)
    fireEvent.click(remove)
    expect(onDelete).toHaveBeenCalledWith(todo.id, todo.title)
  })

  it('아이콘은 바꾸기 전 색으로 칠한다: 타이머 초록·빨강, 메모 주황, 내일 하기 파랑, 날짜 바꾸기 남색', () => {
    renderMenu()
    const iconOf = (name: string) => screen.getByRole('button', { name }).querySelector('svg')

    expect(iconOf('일반 타이머')).toHaveClass('text-icon-green')
    expect(iconOf('뽀모도로 타이머')).toHaveClass('text-icon-red')
    expect(iconOf('메모')).toHaveClass('text-icon-yellow')
    expect(iconOf('내일 하기')).toHaveClass('text-icon-blue')
    expect(iconOf('날짜 바꾸기')).toHaveClass('text-icon-indigo')
  })

  it('완료한 할 일의 또 하기는 주황 아이콘이다', () => {
    renderMenu({ ...todo, isDone: true })
    const iconOf = (name: string) => screen.getByRole('button', { name }).querySelector('svg')

    expect(iconOf('내일 또 하기')).toHaveClass('text-icon-orange')
    expect(iconOf('다른 날 또 하기')).toHaveClass('text-icon-orange')
    expect(iconOf('날짜 바꾸기')).toHaveClass('text-icon-indigo')
  })

  it('완료한 할 일은 타이머 항목도, 완료 안내 글자도 두지 않는다', () => {
    renderMenu({ ...todo, isDone: true })

    expect(screen.queryByRole('button', { name: /타이머$/ })).not.toBeInTheDocument()
    expect(screen.queryByText('완료한 할 일이에요')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '메모' })).toBeInTheDocument()
  })

  it('다른 할 일 타이머가 실행 중이면 그 할 일 이름을 회색 한 줄로 보여 준다', () => {
    useTimerStore.setState({
      timers: { other: { ...initialSingleTimerState, mode: 'pomodoro', status: 'running' } },
      pendingAutoSessions: {},
    })
    renderMenu()

    expect(screen.queryByRole('button', { name: /타이머$/ })).not.toBeInTheDocument()
    expect(screen.getByText("'은행 들르기' 타이머가 실행 중이에요")).toHaveClass('text-text-secondary')
  })
})

describe('TodoMenuSheet 집중 기록', () => {
  afterEach(() => {
    act(() => useTimerStore.setState({ timers: {}, pendingAutoSessions: {} }))
  })

  const renderWithSessions = (selectedTodo: Todo, onOpenSessions = vi.fn()) => {
    render(
      <TodoMenuSheet
        selectedTodo={selectedTodo}
        showNoteModal={false}
        todayDateKey="2026-10-19"
        onClose={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onOpenNote={vi.fn()}
        onOpenTimer={vi.fn()}
        onOpenSessions={onOpenSessions}
        onTodoDateAction={vi.fn()}
        showTimerError={vi.fn()}
      />,
    )
    return onOpenSessions
  }

  it('집중 기록이 없는 할 일에는 "집중 기록" 항목이 없다', () => {
    renderWithSessions(todo)
    expect(screen.queryByRole('button', { name: '집중 기록' })).not.toBeInTheDocument()
  })

  it('끝내지 않은 할 일도 완료한 할 일도 기록이 있으면 "집중 기록"을 두고, 누르면 그 할 일로 연다', () => {
    const notDone = { ...todo, sessionCount: 2, sessionFocusSeconds: 1500 }
    const onOpenSessions = renderWithSessions(notDone)
    fireEvent.click(screen.getByRole('button', { name: '집중 기록' }))
    expect(onOpenSessions).toHaveBeenCalledWith(notDone)
  })

  it('완료한 할 일은 집중 시간만 있어도(횟수 0) "집중 기록"을 둔다', () => {
    renderWithSessions({ ...todo, isDone: true, sessionCount: 0, sessionFocusSeconds: 600 })
    expect(screen.getByRole('button', { name: '집중 기록' })).toBeInTheDocument()
  })

  it('"집중 기록" 아이콘은 목록 아이콘이고 초록(icon-green)이다', () => {
    renderWithSessions({ ...todo, sessionCount: 1, sessionFocusSeconds: 600 })
    const icon = screen.getByRole('button', { name: '집중 기록' }).querySelector('svg')
    expect(icon).toHaveClass('text-icon-green')
  })
})
