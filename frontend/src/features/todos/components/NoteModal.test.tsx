import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Todo } from '../../../api/types'
import { NoteModal } from './NoteModal'

const NOTE = '1. 이진 변환 반복하기:\nhttps://school.programmers.co.kr/learn/courses/30/lessons/70129'

const renderNoteModal = ({
  noteEditMode = false,
  noteText = NOTE,
  isSaving = false,
  noteTodo = null,
}: { noteEditMode?: boolean; noteText?: string; isSaving?: boolean; noteTodo?: Todo | null } = {}) => {
  const onEditNote = vi.fn()
  const onClose = vi.fn()
  const onCancelEdit = vi.fn()
  render(
    <NoteModal
      isOpen
      onClose={onClose}
      onCancelEdit={onCancelEdit}
      noteEditMode={noteEditMode}
      noteTodo={noteTodo}
      noteText={noteText}
      isSaving={isSaving}
      onNoteTextChange={vi.fn()}
      onDeleteNote={vi.fn()}
      onSaveNote={vi.fn()}
      onEditNote={onEditNote}
    />,
  )
  return { onEditNote, onClose, onCancelEdit }
}

// 보기 모드에서 링크를 감싼 덮개(링크 밖 영역)
const getViewOverlay = () => screen.getByRole('link').parentElement!
// 보기 모드의 textarea는 aria-hidden이라 role 쿼리에서 빠지므로 hidden까지 포함해 찾는다
const getTextarea = () => screen.getByRole('textbox', { hidden: true })

describe('NoteModal 보기 모드', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('메모 속 URL을 새 탭 링크로 보여준다', () => {
    renderNoteModal()

    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', 'https://school.programmers.co.kr/learn/courses/30/lessons/70129')
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('링크를 누르면 편집 모드로 바뀌지 않는다', () => {
    const { onEditNote } = renderNoteModal()

    fireEvent.click(screen.getByRole('link'))

    expect(onEditNote).not.toHaveBeenCalled()
  })

  it('링크 밖을 탭(click)하면 편집 모드로 바꾸고 textarea에 포커스한다', () => {
    const { onEditNote } = renderNoteModal()

    fireEvent.click(getViewOverlay())

    expect(onEditNote).toHaveBeenCalledTimes(1)
    expect(getTextarea()).toHaveFocus()
    // focus 순간 이미 숨김 속성이 걷혀 있어야 스크린리더가 입력창을 안내한다
    expect(getTextarea()).not.toHaveAttribute('aria-hidden')
  })

  it('스크롤하려고 손가락을 대는 것(pointerdown)만으로는 편집으로 넘어가지 않는다', () => {
    const { onEditNote } = renderNoteModal()

    fireEvent.pointerDown(getViewOverlay())

    expect(onEditNote).not.toHaveBeenCalled()
  })

  it('텍스트를 드래그로 선택한 뒤의 click은 편집으로 넘어가지 않는다', () => {
    vi.spyOn(window, 'getSelection').mockReturnValue({ toString: () => '이진 변환' } as Selection)
    const { onEditNote } = renderNoteModal()

    fireEvent.click(getViewOverlay())

    expect(onEditNote).not.toHaveBeenCalled()
  })

  // 회고처럼 보이는 편집 버튼은 없고, 키보드는 포커스 때만 보이는 버튼으로 편집에 들어간다(사용자 결정 2026-10-20)
  it('보이는 편집 버튼 없이, 키보드용 숨은 버튼으로 편집 모드에 들어간다', () => {
    const { onEditNote } = renderNoteModal({ noteTodo: { id: 'todo-1', title: '장보기', note: NOTE } as Todo })

    expect(screen.queryByRole('button', { name: '편집' })).not.toBeInTheDocument()
    const keyboardEdit = screen.getByRole('button', { name: '장보기 메모 수정' })
    expect(keyboardEdit).toHaveClass('sr-only', 'focus-visible:not-sr-only')
    fireEvent.click(keyboardEdit)

    expect(onEditNote).toHaveBeenCalledTimes(1)
    expect(getTextarea()).toHaveFocus()
  })

  it('덮개 아래 textarea는 Tab과 스크린리더 대상에서 빠진다', () => {
    renderNoteModal()

    expect(getTextarea()).toHaveAttribute('tabindex', '-1')
    expect(getTextarea()).toHaveAttribute('aria-hidden', 'true')
  })

  it('빈 메모도 보기 모드의 textarea는 Tab과 스크린리더 대상에서 빠진다(경계 없는 입력창에 포커스가 가지 않게)', () => {
    renderNoteModal({ noteText: '' })

    expect(getTextarea()).toHaveAttribute('tabindex', '-1')
    expect(getTextarea()).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByRole('button', { name: '메모 수정' })).toBeInTheDocument()
  })

  it('빈 메모는 textarea를 눌러 편집 모드에 들어간다', () => {
    const { onEditNote } = renderNoteModal({ noteText: '' })

    fireEvent.pointerDown(getTextarea())

    expect(onEditNote).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('textbox')).toHaveFocus()
  })
})

describe('NoteModal 편집 모드', () => {
  it('메모 원문은 textarea로 편집한다', () => {
    renderNoteModal({ noteEditMode: true })

    expect(screen.getByRole('textbox')).toHaveValue(NOTE)
  })

  it('입력창 안 링크는 뒤에 깐 미러로 보여주고, 눌러지는 링크로 노출하지 않는다', () => {
    renderNoteModal({ noteEditMode: true })

    // 미러는 aria-hidden이라 role 쿼리에서 빠진다. 커서가 링크 밖이면 '링크 열기'도 없다
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    const mirrorLinks = screen.getAllByRole('link', { hidden: true })
    expect(mirrorLinks[0]).toHaveAttribute('href', 'https://school.programmers.co.kr/learn/courses/30/lessons/70129')
    // textarea와 줄바꿈 위치를 맞추기 위해 미러 링크에는 <wbr>을 넣지 않는다
    expect(mirrorLinks[0].querySelector('wbr')).toBeNull()
  })

  it('커서가 링크 안에 있으면 링크 열기를 보여준다', () => {
    renderNoteModal({ noteEditMode: true })
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    const insideUrl = NOTE.indexOf('programmers')

    textarea.setSelectionRange(insideUrl, insideUrl)
    fireEvent.select(textarea)

    const open = screen.getByRole('link', { name: /링크 열기/ })
    expect(open).toHaveAttribute('href', 'https://school.programmers.co.kr/learn/courses/30/lessons/70129')
    expect(open).toHaveAttribute('target', '_blank')
  })

  it('커서가 링크 밖으로 나가면 링크 열기를 숨긴다', () => {
    renderNoteModal({ noteEditMode: true })
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement

    textarea.setSelectionRange(NOTE.indexOf('programmers'), NOTE.indexOf('programmers'))
    fireEvent.select(textarea)
    textarea.setSelectionRange(2, 2)
    fireEvent.select(textarea)

    expect(screen.queryByRole('link', { name: /링크 열기/ })).not.toBeInTheDocument()
  })

  it('저장 중에는 저장과 삭제 버튼을 누를 수 없다', () => {
    renderNoteModal({ noteEditMode: true, isSaving: true, noteTodo: { id: 'todo-1', title: '할 일', note: NOTE } as Todo })

    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '삭제' })).toBeDisabled()
    expect(screen.getByRole('textbox')).toHaveAttribute('readonly')
  })

  it('편집 중 Escape는 시트를 닫지 않고 고친 내용을 되돌린다', () => {
    const { onClose, onCancelEdit } = renderNoteModal({ noteEditMode: true, noteTodo: { id: 'todo-1', title: '할 일', note: NOTE } as Todo })

    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' })

    expect(onCancelEdit).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('한글 조합 중의 Escape는 조합만 끝내고 되돌리지 않는다', () => {
    const { onClose, onCancelEdit } = renderNoteModal({ noteEditMode: true, noteTodo: { id: 'todo-1', title: '할 일', note: NOTE } as Todo })

    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape', isComposing: true })

    expect(onCancelEdit).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('저장된 메모가 없으면 되돌릴 글이 없어 편집 중 Escape도 시트를 닫는다', () => {
    const { onClose, onCancelEdit } = renderNoteModal({ noteEditMode: true, noteText: '쓰는 중', noteTodo: { id: 'todo-1', title: '할 일', note: null } as Todo })

    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' })

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onCancelEdit).not.toHaveBeenCalled()
  })

  it('보기 모드의 Escape는 시트를 닫는다', () => {
    const { onClose, onCancelEdit } = renderNoteModal({ noteTodo: { id: 'todo-1', title: '할 일', note: NOTE } as Todo })

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onCancelEdit).not.toHaveBeenCalled()
  })
})

describe('NoteModal 구성', () => {
  const todo = { id: 'todo-1', title: '장보기 목록 정리', note: NOTE } as Todo

  it('시트 이름은 보이는 제목(할 일 이름)이고, 보기 모드에는 안내 문구와 삭제가 없다', () => {
    renderNoteModal({ noteTodo: todo })

    expect(screen.getByRole('dialog', { name: '장보기 목록 정리' })).toBeInTheDocument()
    expect(screen.queryByText(/탭하면/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '삭제' })).not.toBeInTheDocument()
    // 보기 모드 글자는 상자(배경, 테두리) 없이 보인다
    expect(getViewOverlay()).toHaveClass('border-transparent')
    expect(getViewOverlay().className).not.toMatch(/bg-surface/)
  })

  // 회고와 같은 규칙(사용자 결정 2026-10-20): 제목 줄 왼쪽에 빨간 삭제, 오른쪽에 초록 글자 저장. 입력 칸 아래 버튼 줄은 없다
  it('편집 모드는 제목 줄 왼쪽에 빨간 삭제, 오른쪽에 초록 저장을 둔다', () => {
    renderNoteModal({ noteTodo: todo, noteEditMode: true })

    const heading = screen.getByRole('heading', { name: '장보기 목록 정리' })
    const header = heading.parentElement!
    const save = screen.getByRole('button', { name: '저장' })
    const remove = screen.getByRole('button', { name: '삭제' })
    expect(header).toContainElement(save)
    expect(header).toContainElement(remove)
    // 왼쪽 삭제 → 가운데 제목 → 오른쪽 저장
    expect(remove.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(heading.compareDocumentPosition(save) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // 저장은 채운 주 버튼이 아니라 배경 없는 초록 글자, 삭제는 빨간 글자다
    expect(save).toHaveClass('text-accent-text')
    expect(save).not.toHaveClass('bg-accent-fill')
    expect(remove).toHaveClass('text-state-error-text')
  })

  it('입력 칸 아래에는 링크 열기 줄(자리 고정)만 있고 버튼 줄은 없다', () => {
    renderNoteModal({ noteTodo: todo, noteEditMode: true })
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    const linkRow = textarea.parentElement!.nextElementSibling!
    expect(linkRow).toHaveClass('mt-list', 'min-h-11')
    // 저장과 삭제는 제목 줄에 하나씩만 있다
    expect(screen.getAllByRole('button', { name: '저장' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: '삭제' })).toHaveLength(1)

    const insideUrl = NOTE.indexOf('programmers')
    textarea.setSelectionRange(insideUrl, insideUrl)
    fireEvent.select(textarea)
    expect(linkRow).toContainElement(screen.getByRole('link', { name: /링크 열기/ }))
    expect(linkRow.querySelectorAll('button')).toHaveLength(0)
  })

  it('보기 모드는 제목 줄에 버튼이 없고, 보이는 닫기 X도 없다', () => {
    renderNoteModal({ noteTodo: todo })

    const header = screen.getByRole('heading', { name: '장보기 목록 정리' }).parentElement!
    expect(header.querySelectorAll('button')).toHaveLength(0)
    expect(header).not.toContainElement(screen.getByRole('button', { name: '닫기' }))
  })

  it('편집 모드에서 글자는 뒤에 깐 미러가 입력창 배경과 함께 그리고, textarea는 투명하게 위에 겹친다', () => {
    renderNoteModal({ noteTodo: todo, noteEditMode: true })

    // 미러가 textarea 뒤에 있으므로 textarea에 배경을 칠하면 글자가 가려진다
    const mirror = screen.getAllByRole('link', { hidden: true })[0].parentElement!
    expect(mirror).toHaveAttribute('aria-hidden')
    expect(mirror).toHaveClass('bg-surface-sunken')
    expect(screen.getByRole('textbox')).toHaveClass('bg-transparent', 'text-transparent')
  })

  it('저장된 메모가 없으면 편집 모드에도 삭제 버튼이 없다', () => {
    renderNoteModal({ noteTodo: { ...todo, note: null }, noteEditMode: true, noteText: '쓰는 중' })

    expect(screen.getByRole('button', { name: '저장' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '삭제' })).not.toBeInTheDocument()
  })

  it('편집 입력창의 포커스 표시는 테두리에 붙은 선 하나다(회고 입력창과 같은 ring-1)', () => {
    renderNoteModal({ noteTodo: todo, noteEditMode: true })

    const textarea = screen.getByRole('textbox')
    expect(textarea).toHaveClass('focus:border-text-primary', 'focus:ring-1', 'focus:ring-text-primary')
    expect(textarea).not.toHaveClass('focus:ring-2')
  })

  it('빈 메모의 편집 모드는 textarea가 입력창 배경을 칠한다', () => {
    renderNoteModal({ noteTodo: { ...todo, note: null }, noteEditMode: true, noteText: '' })

    expect(screen.getByRole('textbox')).toHaveClass('bg-surface-sunken', 'text-text-primary')
  })
})
