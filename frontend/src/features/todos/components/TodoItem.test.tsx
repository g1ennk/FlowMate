import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TodoItem, type TodoItemProps } from './TodoItem'

const LONG_NOTE = '1. 이진 변환 반복하기:\nhttps://school.programmers.co.kr/learn/courses/30/lessons/70129'

// jsdom에는 레이아웃이 없어 메모가 한 줄을 넘치는지 scrollHeight/clientHeight로 흉내 낸다
const mockNoteOverflow = (overflow: boolean) => {
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(23)
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(overflow ? 69 : 23)
}

const renderTodoItem = (props: Partial<TodoItemProps> = {}) => {
  const onOpenNote = vi.fn()
  const element = (overrides: Partial<TodoItemProps> = {}) => (
    <TodoItem
      todoId="todo-1"
      title="ps: 1, 2번 유형"
      sessionCount={0}
      sessionFocusSeconds={0}
      isDone={false}
      isEditing={false}
      editingTitle=""
      onEditingTitleChange={vi.fn()}
      onToggle={vi.fn()}
      onEdit={vi.fn()}
      onSaveEdit={vi.fn()}
      onCancelEdit={vi.fn()}
      onDelete={vi.fn()}
      onOpenNote={onOpenNote}
      {...props}
      {...overrides}
    />
  )
  const { rerender } = render(element())
  return { onOpenNote, rerenderWith: (overrides: Partial<TodoItemProps>) => rerender(element(overrides)) }
}

const getNoteText = () => screen.getByText('1. 이진 변환 반복하기:', { exact: false })

describe('TodoItem 메모', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('긴 메모는 한 줄로 접힌 채 시작하고 펼치기 버튼을 보인다', () => {
    mockNoteOverflow(true)
    renderTodoItem({ note: LONG_NOTE })

    expect(getNoteText()).toHaveClass('line-clamp-1')
    expect(screen.getByRole('button', { name: '메모 펼치기' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('펼치기 버튼은 메모를 펼치고 접으며 메모 모달은 열지 않는다', () => {
    mockNoteOverflow(true)
    const { onOpenNote } = renderTodoItem({ note: LONG_NOTE })

    fireEvent.click(screen.getByRole('button', { name: '메모 펼치기' }))

    expect(getNoteText()).not.toHaveClass('line-clamp-1')
    expect(screen.getByRole('button', { name: '메모 접기' })).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(screen.getByRole('button', { name: '메모 접기' }))

    expect(getNoteText()).toHaveClass('line-clamp-1')
    expect(onOpenNote).not.toHaveBeenCalled()
  })

  it('메모 본문을 누르면 메모 모달을 연다', () => {
    mockNoteOverflow(true)
    const { onOpenNote } = renderTodoItem({ note: LONG_NOTE })

    fireEvent.click(getNoteText())

    expect(onOpenNote).toHaveBeenCalledTimes(1)
  })

  it('메모 속 링크는 새 탭으로 열고 메모 모달은 열지 않는다', () => {
    mockNoteOverflow(true)
    const { onOpenNote } = renderTodoItem({ note: LONG_NOTE })

    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', 'https://school.programmers.co.kr/learn/courses/30/lessons/70129')
    expect(link).toHaveAttribute('target', '_blank')

    fireEvent.click(link)

    expect(onOpenNote).not.toHaveBeenCalled()
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
