import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NoteModal } from './NoteModal'

const NOTE = '1. 이진 변환 반복하기:\nhttps://school.programmers.co.kr/learn/courses/30/lessons/70129'

const renderNoteModal = ({
  noteEditMode = false,
  noteText = NOTE,
  isSaving = false,
}: { noteEditMode?: boolean; noteText?: string; isSaving?: boolean } = {}) => {
  const onEditNote = vi.fn()
  render(
    <NoteModal
      isOpen
      onClose={vi.fn()}
      noteEditMode={noteEditMode}
      noteTodo={null}
      noteText={noteText}
      isSaving={isSaving}
      onNoteTextChange={vi.fn()}
      onDeleteNote={vi.fn()}
      onSaveNote={vi.fn()}
      onEditNote={onEditNote}
    />,
  )
  return { onEditNote }
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

  it('편집 버튼으로 편집 모드에 들어간다', () => {
    const { onEditNote } = renderNoteModal()

    fireEvent.click(screen.getByRole('button', { name: '편집' }))

    expect(onEditNote).toHaveBeenCalledTimes(1)
    expect(getTextarea()).toHaveFocus()
  })

  it('덮개 아래 textarea는 Tab과 스크린리더 대상에서 빠진다', () => {
    renderNoteModal()

    expect(getTextarea()).toHaveAttribute('tabindex', '-1')
    expect(getTextarea()).toHaveAttribute('aria-hidden', 'true')
  })

  it('빈 메모는 textarea를 눌러 편집 모드에 들어간다', () => {
    const { onEditNote } = renderNoteModal({ noteText: '' })

    fireEvent.pointerDown(screen.getByRole('textbox'))

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
    renderNoteModal({ noteEditMode: true, isSaving: true })

    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '삭제' })).toBeDisabled()
    expect(screen.getByRole('textbox')).toHaveAttribute('readonly')
  })
})
