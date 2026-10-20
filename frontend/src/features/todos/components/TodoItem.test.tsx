import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useTimerStore } from '../../timer/timerStore'
import { TodoItem, type TodoItemProps } from './TodoItem'

const LONG_NOTE = '1. 이진 변환 반복하기:\nhttps://school.programmers.co.kr/learn/courses/30/lessons/70129'

// jsdom에는 레이아웃이 없어 메모가 한 줄을 넘치는지 scrollHeight/clientHeight로 흉내 낸다
const mockNoteOverflow = (overflow: boolean) => {
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(23)
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(overflow ? 69 : 23)
}

const renderTodoItem = (props: Partial<TodoItemProps> = {}) => {
  const element = (overrides: Partial<TodoItemProps> = {}) => (
    <TodoItem
      todoId="todo-1"
      title="ps: 1, 2번 유형"
      sessionFocusSeconds={0}
      isDone={false}
      isEditing={false}
      editingTitle=""
      onEditingTitleChange={vi.fn()}
      onToggle={vi.fn()}
      onSaveEdit={vi.fn()}
      onCancelEdit={vi.fn()}
      {...props}
      {...overrides}
    />
  )
  const { rerender } = render(element())
  return { rerenderWith: (overrides: Partial<TodoItemProps>) => rerender(element(overrides)) }
}

const getNoteText = () => screen.getByText('1. 이진 변환 반복하기:', { exact: false })

describe('TodoItem 메모', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('긴 메모는 한 줄로 접힌 채 시작하고, 보이는 펼침 아이콘 없이 키보드용 버튼만 둔다', () => {
    mockNoteOverflow(true)
    renderTodoItem({ note: LONG_NOTE })

    expect(getNoteText()).toHaveClass('line-clamp-1')
    const toggle = screen.getByRole('button', { name: '메모 펼치기' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).toHaveClass('sr-only', 'focus-visible:not-sr-only')
    expect(toggle.querySelector('svg')).toBeNull()
  })

  it('메모는 제목보다 한 단계 작고 연한 글자라 제목과 확실히 구분된다', () => {
    mockNoteOverflow(false)
    renderTodoItem({ note: '짧은 메모' })
    const memo = screen.getByText('짧은 메모')
    expect(memo).toHaveClass('text-xs', 'text-text-tertiary')
    expect(memo).not.toHaveClass('text-sm', 'text-text-secondary')
    expect(screen.getByText('ps: 1, 2번 유형')).toHaveClass('text-sm')
  })

  it('긴 메모 글자를 누르면 펼치고 다시 누르면 접으며 메뉴는 열지 않는다', () => {
    mockNoteOverflow(true)
    const onOpenMenu = vi.fn()
    renderTodoItem({ note: LONG_NOTE, onOpenMenu })

    // 넘치는 메모 줄은 제목 버튼 덮개 위에 올라와 자기 탭을 받는다. jsdom은 쌓임 순서를 모르므로
    // 메모가 제목 버튼 밖에 있고 positioned라는 구조를 확인한다(실제 겹침은 브라우저 elementFromPoint로 본다)
    expect(screen.getByRole('button', { name: /메뉴 열기$/ }).contains(getNoteText())).toBe(false)
    expect(getNoteText()).toHaveClass('relative', 'cursor-pointer')
    fireEvent.click(getNoteText())
    expect(getNoteText()).not.toHaveClass('line-clamp-1')
    expect(screen.getByRole('button', { name: '메모 접기' })).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(getNoteText())
    expect(getNoteText()).toHaveClass('line-clamp-1')
    expect(onOpenMenu).not.toHaveBeenCalled()
  })

  it('키보드용 버튼도 메모를 펼치고 접는다', () => {
    mockNoteOverflow(true)
    renderTodoItem({ note: LONG_NOTE })

    fireEvent.click(screen.getByRole('button', { name: '메모 펼치기' }))
    expect(getNoteText()).not.toHaveClass('line-clamp-1')
    fireEvent.click(screen.getByRole('button', { name: '메모 접기' }))
    expect(getNoteText()).toHaveClass('line-clamp-1')
  })

  it('짧은 메모 글자는 따로 누르는 곳이 아니라 제목 버튼(메뉴) 영역에 들어간다', () => {
    mockNoteOverflow(false)
    renderTodoItem({ note: '짧은 메모' })

    expect(screen.getByRole('button', { name: 'ps: 1, 2번 유형 메뉴 열기' })).toHaveClass('after:absolute', 'after:inset-0')
    expect(screen.getByText('짧은 메모')).not.toHaveClass('relative')
    expect(screen.getByText('짧은 메모')).toHaveClass('[&_a]:relative')
  })

  it('메모 속 링크는 새 탭으로 열고 메뉴는 열지 않는다', () => {
    mockNoteOverflow(true)
    const onOpenMenu = vi.fn()
    renderTodoItem({ note: LONG_NOTE, onOpenMenu })

    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', 'https://school.programmers.co.kr/learn/courses/30/lessons/70129')
    expect(link).toHaveAttribute('target', '_blank')

    fireEvent.click(link)

    expect(onOpenMenu).not.toHaveBeenCalled()
    // 링크를 눌러도 메모가 펼쳐지지 않는다
    expect(getNoteText()).toHaveClass('line-clamp-1')
  })

  it('한 줄에 들어가는 짧은 메모에는 펼치기 버튼이 없다', () => {
    mockNoteOverflow(false)
    renderTodoItem({ note: '짧은 메모' })

    expect(screen.getByText('짧은 메모')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /메모 (펼치기|접기)/ })).not.toBeInTheDocument()
  })

  it('펼친 메모를 지웠다가 다시 쓰면 접힌 상태로 시작한다', () => {
    mockNoteOverflow(true)
    const { rerenderWith } = renderTodoItem({ note: LONG_NOTE })
    fireEvent.click(screen.getByRole('button', { name: '메모 펼치기' }))

    rerenderWith({ note: null })
    rerenderWith({ note: LONG_NOTE })

    expect(getNoteText()).toHaveClass('line-clamp-1')
    expect(screen.getByRole('button', { name: '메모 펼치기' })).toBeInTheDocument()
  })

  it('제목 편집이 끝나면 메모를 다시 측정한다', () => {
    mockNoteOverflow(false)
    const { rerenderWith } = renderTodoItem({ note: LONG_NOTE })
    expect(screen.queryByRole('button', { name: '메모 펼치기' })).not.toBeInTheDocument()

    rerenderWith({ isEditing: true })
    mockNoteOverflow(true)
    rerenderWith({ isEditing: false })

    expect(screen.getByRole('button', { name: '메모 펼치기' })).toBeInTheDocument()
  })

  it('메모가 없으면 메모 영역을 그리지 않는다', () => {
    renderTodoItem({ note: null })

    expect(screen.queryByRole('button', { name: /메모 (펼치기|접기)/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})

describe('TodoItem 접근성과 표시', () => {
  afterEach(() => {
    act(() => useTimerStore.setState({ timers: {}, pendingAutoSessions: {} }))
  })

  it('제목을 누르면 메뉴를 열고, 더보기(⋮) 버튼은 없다', () => {
    const onOpenMenu = vi.fn()
    renderTodoItem({ onOpenMenu })

    fireEvent.click(screen.getByRole('button', { name: 'ps: 1, 2번 유형 메뉴 열기' }))

    expect(onOpenMenu).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: /더보기/ })).not.toBeInTheDocument()
  })

  it('기록 시간이 있는 행은 오른쪽 버튼이 없고, 타이머를 열 수 없으면 시간은 버튼이 아닌 글자로 보인다', () => {
    renderTodoItem({ sessionFocusSeconds: 600, onStartFocus: vi.fn() })

    expect(screen.getByText('10분').closest('button')).toBeNull()
    expect(screen.queryByRole('button', { name: /집중 시작|타이머 열기|타이머 화면 열기/ })).not.toBeInTheDocument()
  })

  it('기록이 없어도 집중 시작 버튼이 있다', () => {
    renderTodoItem({ onStartFocus: vi.fn() })

    expect(screen.getByRole('button', { name: 'ps: 1, 2번 유형 집중 시작' })).toBeInTheDocument()
  })

  it.each(['paused', 'waiting'] as const)('%s 타이머도 오른쪽 버튼 없이 시간 줄로 타이머 화면을 연다', (status) => {
    act(() => {
      useTimerStore.setState({
        timers: { 'todo-1': { mode: 'stopwatch', status, flexiblePhase: 'focus', focusElapsedMs: 60_000 } as never },
      })
    })
    const onOpenTimer = vi.fn()
    renderTodoItem({ onStartFocus: vi.fn(), onOpenTimer })

    expect(screen.queryByRole('button', { name: /집중 시작|집중 이어서|타이머 열기$/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'ps: 1, 2번 유형 타이머 화면 열기' }))
    expect(onOpenTimer).toHaveBeenCalledTimes(1)
    act(() => useTimerStore.setState({ timers: {} }))
  })

  it('완료한 할 일과 선택 모드에는 집중 버튼이 없다', () => {
    const { rerenderWith } = renderTodoItem({ isDone: true, onStartFocus: vi.fn() })
    expect(screen.queryByRole('button', { name: /집중 시작/ })).not.toBeInTheDocument()

    rerenderWith({ isDone: false, selectMode: true, onSelect: vi.fn() })
    expect(screen.queryByRole('button', { name: /집중 시작/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /메뉴 열기/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ps: 1, 2번 유형 선택' })).toBeInTheDocument()
  })

  it('선택 모드에서 고른 완료 행은 accent-subtle 위라 tertiary 대신 secondary 글자를 쓴다', () => {
    renderTodoItem({ isDone: true, selectMode: true, isSelected: true, sessionFocusSeconds: 600, onSelect: vi.fn() })

    expect(screen.getByText('ps: 1, 2번 유형')).toHaveClass('text-text-secondary')
    expect(screen.getByText('ps: 1, 2번 유형')).not.toHaveClass('text-text-tertiary')
    expect(screen.getByText('10분').parentElement).toHaveClass('text-text-secondary')
  })

  it('focusDisabled면 집중 버튼을 누를 수 없다', () => {
    renderTodoItem({ onStartFocus: vi.fn(), focusDisabled: true })

    expect(screen.getByRole('button', { name: 'ps: 1, 2번 유형 집중 시작' })).toBeDisabled()
  })

  it('강조 중인 행은 표시가 붙는다', () => {
    renderTodoItem({ isHighlighted: true })

    expect(screen.getByRole('button', { name: 'ps: 1, 2번 유형 메뉴 열기' }).closest('[data-todo-id]')).toHaveAttribute(
      'data-highlighted',
      'true',
    )
  })

  it('긴 영어 단어를 글자 중간에서 끊지 않고, 한국어는 단어 단위로 줄을 바꾼다', () => {
    renderTodoItem({ title: 'Refactoring the authentication module' })

    const title = screen.getByText('Refactoring the authentication module')
    expect(title).not.toHaveClass('break-all')
    expect(title).toHaveClass('break-keep')
  })
})

describe('TodoItem 제목 수정', () => {
  it('입력 중인 줄은 상자 없이 보이고, 완료 버튼 없이 Enter나 바깥을 눌러 저장한다', () => {
    const onSaveEdit = vi.fn()
    renderTodoItem({ isEditing: true, editingTitle: '고칠 제목', onSaveEdit })

    const input = screen.getByRole('textbox', { name: '할 일 제목' })
    expect(input).toHaveValue('고칠 제목')
    expect(screen.queryByRole('button', { name: '완료' })).not.toBeInTheDocument()

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSaveEdit).toHaveBeenCalledTimes(1)
    fireEvent.blur(input)
    expect(onSaveEdit).toHaveBeenCalledTimes(2)
  })
})

describe('TodoItem 시간 표시', () => {
  afterEach(() => {
    act(() => useTimerStore.setState({ timers: {}, pendingAutoSessions: {} }))
  })

  it('멈춘 기록은 분과 시간으로 쓴다', () => {
    renderTodoItem({ sessionFocusSeconds: 200 * 60 })

    expect(screen.getByText('3시간 20분')).toBeInTheDocument()
  })

  it('실행 중인 집중은 "집중 mm:ss"로 쓴다', () => {
    useTimerStore.setState({
      timers: {
        'todo-1': { mode: 'stopwatch', status: 'running', flexiblePhase: 'focus', focusElapsedMs: (18 * 60 + 34) * 1000 } as never,
      },
    })
    renderTodoItem()

    expect(screen.getByText('집중 18:34')).toBeInTheDocument()
  })

  it('실행 중인 휴식은 "휴식 mm:ss"로 쓴다', () => {
    useTimerStore.setState({
      timers: { 'todo-1': { mode: 'pomodoro', status: 'running', phase: 'short', remainingMs: 5 * 60 * 1000 } as never },
    })
    renderTodoItem()

    expect(screen.getByText('휴식 5:00')).toBeInTheDocument()
  })

  it('일시정지는 상태 말과 멈춘 형식으로 쓴다', () => {
    useTimerStore.setState({
      timers: {
        'todo-1': { mode: 'stopwatch', status: 'paused', flexiblePhase: 'focus', focusElapsedMs: 12 * 60 * 1000 } as never,
      },
    })
    renderTodoItem()

    expect(screen.getByText('집중 일시정지 · 12분')).toBeInTheDocument()
  })

  // 뽀모도로 일시정지는 남은 시간이다. "N분"만 쓰면 바로 전까지 기록(25분)이던 자리가 줄어든 기록처럼 읽혀서 "남음"을 붙인다(C8)
  it('뽀모도로 일시정지는 남은 시간에 "남음"을 붙여 기록과 헷갈리지 않게 쓴다', () => {
    useTimerStore.setState({
      timers: { 'todo-1': { mode: 'pomodoro', status: 'paused', phase: 'flow', remainingMs: 24 * 60 * 1000 + 30_000 } as never },
    })
    renderTodoItem({ sessionFocusSeconds: 25 * 60 })

    expect(screen.getByText('집중 일시정지 · 24분 남음')).toBeInTheDocument()
  })

  it('뽀모도로 휴식 일시정지도 남은 시간이다', () => {
    useTimerStore.setState({
      timers: { 'todo-1': { mode: 'pomodoro', status: 'paused', phase: 'short', remainingMs: 4 * 60 * 1000 } as never },
    })
    renderTodoItem()

    expect(screen.getByText('휴식 일시정지 · 4분 남음')).toBeInTheDocument()
  })

  it('일반 타이머 자유 휴식 일시정지는 쉰 시간이라 "남음"을 붙이지 않는다', () => {
    useTimerStore.setState({
      timers: {
        'todo-1': { mode: 'stopwatch', status: 'paused', flexiblePhase: 'break_free', focusElapsedMs: 0, breakElapsedMs: 5 * 60 * 1000 } as never,
      },
    })
    renderTodoItem()

    expect(screen.getByText('휴식 일시정지 · 5분')).toBeInTheDocument()
  })

  it('단계 끝 대기는 끝난 단계를 쓴다', () => {
    useTimerStore.setState({
      timers: { 'todo-1': { mode: 'pomodoro', status: 'waiting', phase: 'short', remainingMs: 5 * 60 * 1000 } as never },
    })
    renderTodoItem()

    expect(screen.getByText('집중 끝')).toBeInTheDocument()
  })

  it('실행 중인 뽀모도로를 빨강(오류 색)으로 쓰지 않는다', () => {
    useTimerStore.setState({
      timers: { 'todo-1': { mode: 'pomodoro', status: 'running', phase: 'flow', remainingMs: 10 * 60 * 1000 } as never },
    })
    renderTodoItem()

    const time = screen.getByText('집중 10:00')
    expect(time.parentElement).toHaveClass('text-accent-text')
    expect(time.parentElement).not.toHaveClass('text-state-error-text')
  })
})

describe('TodoItem 정렬(Task 21)', () => {
  it('체크와 집중 버튼은 높이 44 칸 가운데, 제목은 14/20이라 셋의 가운데가 첫 줄에 맞는다', () => {
    renderTodoItem({ onStartFocus: vi.fn(), onOpenMenu: vi.fn() })
    const check = screen.getByRole('button', { name: 'ps: 1, 2번 유형 완료' })
    const focus = screen.getByRole('button', { name: 'ps: 1, 2번 유형 집중 시작' })

    // 체크는 구간 화살표와 같은 앞 열(32), 집중 버튼은 구간 + 버튼과 같은 오른쪽 끝
    expect(check.parentElement).toHaveClass('h-11', 'w-8', 'items-center', 'justify-center')
    expect(focus.parentElement).toHaveClass('h-11', 'items-center')
    expect(screen.getByText('ps: 1, 2번 유형')).toHaveClass('block', 'text-sm', 'leading-5')
  })
})

describe('TodoItem 집중 기록 시계', () => {
  const clockOf = () => screen.getByText('50분').previousElementSibling

  it('일반 타이머로 기록한 할 일은 시계를 초록으로, 뽀모도로는 빨강으로 칠한다', () => {
    const { rerenderWith } = renderTodoItem({ sessionFocusSeconds: 3000, timerMode: 'stopwatch' })
    expect(clockOf()).toHaveClass('text-icon-green')

    rerenderWith({ timerMode: 'pomodoro' })
    expect(clockOf()).toHaveClass('text-icon-red')
  })

  it('모드를 모르면 일반 타이머 색(초록)을 쓴다', () => {
    renderTodoItem({ sessionFocusSeconds: 3000, timerMode: null })
    expect(clockOf()).toHaveClass('text-icon-green')
  })
})

describe('TodoItem 진행 중인 타이머 시간 줄', () => {
  afterEach(() => {
    act(() => useTimerStore.setState({ timers: {} }))
  })

  it('타이머가 돌고 있으면 시간 줄을 눌러 타이머를 연다', () => {
    const onOpenTimer = vi.fn()
    const onOpenMenu = vi.fn()
    act(() => {
      useTimerStore.getState().startStopwatch('todo-1', 0)
    })
    renderTodoItem({ onOpenTimer, onOpenMenu })

    const timeButton = screen.getByRole('button', { name: 'ps: 1, 2번 유형 타이머 화면 열기' })
    // jsdom은 쌓임 순서를 모른다. 시간 줄 버튼이 제목 버튼 밖에 있고 positioned라서 덮개 위에 온다는 구조를 대신 확인한다
    expect(screen.getByRole('button', { name: 'ps: 1, 2번 유형 메뉴 열기' }).contains(timeButton)).toBe(false)
    expect(timeButton).toHaveClass('relative')
    fireEvent.click(timeButton)
    expect(onOpenTimer).toHaveBeenCalledTimes(1)
    expect(onOpenMenu).not.toHaveBeenCalled()
  })

  // 위아래로 12px 넓히면 4px 간격 너머 짧은 메모 윗부분과 제목 끝 줄 아랫부분의 탭을 가져갔다(최종 리뷰 r2 I-3)
  it('시간 줄 터치 영역은 위아래로 이웃 줄 간격(4px)까지만 넓힌다', () => {
    renderTodoItem({ sessionFocusSeconds: 3000, onOpenTimer: vi.fn(), note: '짧은 메모' })
    const timeButton = screen.getByRole('button', { name: 'ps: 1, 2번 유형 타이머 화면 열기' })
    expect(timeButton).toHaveClass('after:-inset-y-1', 'after:-inset-x-1', 'mt-tight')
    expect(timeButton.className).not.toMatch(/after:-inset-y-(?!1(\s|$))/)
    expect(timeButton.className).not.toMatch(/after:-?inset-0|after:-top-|after:-bottom-/)
  })

  it('타이머가 돌지 않아도 기록 시간 줄을 누르면 타이머 화면을 연다', () => {
    const onOpenTimer = vi.fn()
    renderTodoItem({ sessionFocusSeconds: 3000, onOpenTimer })
    fireEvent.click(screen.getByRole('button', { name: 'ps: 1, 2번 유형 타이머 화면 열기' }))
    expect(onOpenTimer).toHaveBeenCalledTimes(1)
  })

  it('완료한 할 일과 선택 모드에서는 시간 줄이 버튼이 아니다', () => {
    const { rerenderWith } = renderTodoItem({ sessionFocusSeconds: 3000, isDone: true, onOpenTimer: vi.fn() })
    expect(screen.queryByRole('button', { name: 'ps: 1, 2번 유형 타이머 화면 열기' })).not.toBeInTheDocument()
    rerenderWith({ isDone: false, selectMode: true })
    expect(screen.queryByRole('button', { name: 'ps: 1, 2번 유형 타이머 화면 열기' })).not.toBeInTheDocument()
  })
})

describe('TodoItem 오른쪽 ▶ 버튼', () => {
  const startButton = () => screen.queryByRole('button', { name: 'ps: 1, 2번 유형 집중 시작' })

  it('타이머를 한 번도 쓰지 않아 시간 줄이 없는 할 일만 ▶를 두고, 누르면 시작 메뉴를 연다', () => {
    const onStartFocus = vi.fn()
    renderTodoItem({ onStartFocus })
    expect(startButton()).toHaveAttribute('aria-haspopup', 'menu')
    fireEvent.click(startButton()!)
    expect(onStartFocus).toHaveBeenCalledTimes(1)
  })

  it('기록 시간이 있거나 타이머가 진행 중이면 오른쪽 버튼 없이 시간 줄로 타이머에 간다', () => {
    const { rerenderWith } = renderTodoItem({ sessionFocusSeconds: 600, onStartFocus: vi.fn(), onOpenTimer: vi.fn() })
    expect(startButton()).toBeNull()
    expect(screen.queryByRole('button', { name: /타이머 열기|이어서/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'ps: 1, 2번 유형 타이머 화면 열기' })).toBeInTheDocument()

    act(() => {
      useTimerStore.getState().startStopwatch('todo-1', 0)
    })
    rerenderWith({ sessionFocusSeconds: 0 })
    expect(startButton()).toBeNull()
    expect(screen.getByRole('button', { name: 'ps: 1, 2번 유형 타이머 화면 열기' })).toBeInTheDocument()
    act(() => useTimerStore.setState({ timers: {} }))
  })
})

describe('TodoItem 행 hover', () => {
  it('보통 행은 마우스를 올리면 회색 면이고, 강조 행은 accent 면이다', () => {
    const { rerenderWith } = renderTodoItem()
    const row = document.querySelector('[data-todo-id="todo-1"]')!
    expect(row).toHaveClass('hover:not-has-[[data-row-subtarget]:hover]:bg-hover')
    rerenderWith({ isHighlighted: true })
    expect(row).toHaveClass('bg-accent-subtle')
    expect(row.className).not.toMatch(/hover:\S*bg-hover/)
  })

  // 따로 눌리는 곳(시간 줄, 넘치는 메모) 위에서는 행 회색 면을 끄고 그곳만 작은 면을 켠다(사용자 결정 2026-10-20)
  it('행 회색 면은 따로 눌리는 곳에 마우스가 없을 때만 켠다', () => {
    renderTodoItem()
    const row = document.querySelector('[data-todo-id="todo-1"]')!
    expect(row).toHaveClass('hover:not-has-[[data-row-subtarget]:hover]:bg-hover')
    expect(row).not.toHaveClass('hover:bg-hover')
  })

  it('시간 줄 버튼(끝내지 않은 할 일, 완료한 할 일)은 따로 눌리는 곳이라 자기 hover 면과 손가락 커서를 갖는다', () => {
    const { rerenderWith } = renderTodoItem({ sessionFocusSeconds: 3000, onOpenTimer: vi.fn(), onOpenSessions: vi.fn() })
    const timerButton = screen.getByRole('button', { name: 'ps: 1, 2번 유형 타이머 화면 열기' })
    expect(timerButton).toHaveAttribute('data-row-subtarget')
    expect(timerButton).toHaveClass('hover:bg-hover-strong', 'cursor-pointer', '-mx-1', 'px-1')
    rerenderWith({ isDone: true })
    const sessionsButton = screen.getByRole('button', { name: 'ps: 1, 2번 유형 집중 기록 보기' })
    expect(sessionsButton).toHaveAttribute('data-row-subtarget')
    expect(sessionsButton).toHaveClass('hover:bg-hover-strong', 'cursor-pointer')
  })

  it('넘치는 메모는 따로 눌리는 곳이고, 짧은 메모는 행(메뉴)의 일부라 표지가 없다', () => {
    mockNoteOverflow(true)
    const { rerenderWith } = renderTodoItem({ note: LONG_NOTE })
    const note = getNoteText()
    expect(note).toHaveAttribute('data-row-subtarget')
    expect(note).toHaveClass('hover:bg-hover-strong', 'cursor-pointer', '-mx-1', 'px-1')
    vi.restoreAllMocks()
    mockNoteOverflow(false)
    rerenderWith({ note: '짧은 메모' })
    const shortNote = screen.getByText('짧은 메모')
    expect(shortNote).not.toHaveAttribute('data-row-subtarget')
    expect(shortNote).not.toHaveClass('hover:bg-hover-strong')
  })

  it('강조 행과 고른 행은 accent 면만 두고 따로 눌리는 곳에도 회색 면을 켜지 않는다', () => {
    renderTodoItem({ sessionFocusSeconds: 3000, onOpenTimer: vi.fn(), isHighlighted: true })
    const timerButton = screen.getByRole('button', { name: 'ps: 1, 2번 유형 타이머 화면 열기' })
    expect(timerButton).not.toHaveClass('hover:bg-hover-strong')
  })
})

describe('TodoItem 완료한 할 일의 시간 줄', () => {
  it('완료한 할 일의 기록 시간 줄은 집중 기록(세션 상세)을 여는 버튼이다', () => {
    const onOpenSessions = vi.fn()
    const onOpenTimer = vi.fn()
    renderTodoItem({ sessionFocusSeconds: 3000, isDone: true, onOpenSessions, onOpenTimer })
    fireEvent.click(screen.getByRole('button', { name: 'ps: 1, 2번 유형 집중 기록 보기' }))
    expect(onOpenSessions).toHaveBeenCalledTimes(1)
    expect(onOpenTimer).not.toHaveBeenCalled()
  })

  it('끝내지 않은 할 일의 시간 줄은 그대로 타이머로 간다', () => {
    const onOpenSessions = vi.fn()
    const onOpenTimer = vi.fn()
    renderTodoItem({ sessionFocusSeconds: 3000, onOpenSessions, onOpenTimer })
    expect(screen.queryByRole('button', { name: 'ps: 1, 2번 유형 집중 기록 보기' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'ps: 1, 2번 유형 타이머 화면 열기' }))
    expect(onOpenTimer).toHaveBeenCalledTimes(1)
    expect(onOpenSessions).not.toHaveBeenCalled()
  })

  it('선택 모드에서는 완료한 할 일의 시간 줄도 버튼이 아니다', () => {
    renderTodoItem({ sessionFocusSeconds: 3000, isDone: true, onOpenSessions: vi.fn(), selectMode: true })
    expect(screen.queryByRole('button', { name: 'ps: 1, 2번 유형 집중 기록 보기' })).not.toBeInTheDocument()
  })
})

describe('TodoItem 강조 행의 시간 줄', () => {
  it('강조 행에서도 시간 줄 버튼 모서리가 둥글어 포커스 링이 각지지 않는다', () => {
    renderTodoItem({ sessionFocusSeconds: 600, onOpenTimer: vi.fn(), isHighlighted: true })
    expect(screen.getByRole('button', { name: 'ps: 1, 2번 유형 타이머 화면 열기' })).toHaveClass('rounded-control')
  })
})
