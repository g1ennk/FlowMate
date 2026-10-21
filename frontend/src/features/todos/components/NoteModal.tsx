import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { BottomSheet } from '../../../ui/BottomSheet'
import { Button } from '../../../ui/Button'
import { userTextDisplayClass, userTextInputClass } from '../../../lib/userTextStyles'
import type { Todo } from '../../../api/types'
import { findUrls, linkifyText } from '../linkifyText'

type NoteModalProps = {
  isOpen: boolean
  // 닫기(바깥 누르기, 끌어내리기, 보기 모드 Escape). 고친 내용이 있으면 저장하고 닫는다
  onClose: () => void
  // 편집 중 Escape: 저장된 메모로 되돌리고 보기 모드로 돌아간다(시트는 열어 둔다)
  onCancelEdit: () => void
  noteEditMode: boolean
  noteTodo: Todo | null
  noteText: string
  isSaving?: boolean
  onNoteTextChange: (text: string) => void
  onDeleteNote: () => void
  onSaveNote: () => void
  onEditNote: () => void
}

// 보기와 편집이 같은 자리에 같은 글자 상자를 쓴다(줄바꿈 위치가 바뀌지 않게). 보기 모드는 테두리와 배경이 없고,
// 편집 모드에서만 입력창 모양(sunken 배경, 3:1 테두리, 포커스 때 테두리에 붙은 ring-1로 선 하나. 회고 TextArea와 같다)을 보인다
const BOX = 'rounded-control border p-3'

export function NoteModal({
  isOpen,
  onClose,
  onCancelEdit,
  noteEditMode,
  noteTodo,
  noteText,
  isSaving = false,
  onNoteTextChange,
  onDeleteNote,
  onSaveNote,
  onEditNote,
}: NoteModalProps) {
  const memoTextareaRef = useRef<HTMLTextAreaElement>(null)
  const mirrorRef = useRef<HTMLDivElement>(null)
  const [caretPos, setCaretPos] = useState<number | null>(null)

  useEffect(() => {
    if (noteEditMode && memoTextareaRef.current) {
      memoTextareaRef.current.focus()
      const length = memoTextareaRef.current.value.length
      memoTextareaRef.current.setSelectionRange(length, length)
    }
  }, [noteEditMode])

  const title = noteTodo ? noteTodo.title : '메모'
  // 보기 모드의 글자는 덮개로 보여 주고, 덮개 아래 textarea는 opacity-0으로 숨긴다.
  // 보기 모드 동안 textarea는 Tab 순서와 접근성 트리에서 빼고(tabIndex -1, aria-hidden), 편집은 글자를 누르거나 제목 줄의 수정 버튼으로 시작한다
  const isViewOverlay = !noteEditMode && noteText.length > 0
  // 편집 모드: textarea 안에는 링크를 넣을 수 없어, 뒤에 같은 텍스트(미러)를 깔고 textarea 글자를 투명하게 해 링크를 보여준다
  const isEditMirror = noteEditMode && noteText.length > 0
  // 커서가 링크 안에 있으면 입력창 아래에 '링크 열기'를 띄운다
  const activeUrl =
    noteEditMode && caretPos !== null
      ? findUrls(noteText).find(({ start, url }) => caretPos >= start && caretPos <= start + url.length)?.url
      : undefined

  // 미러는 textarea보다 늦게 마운트되므로(보기→편집 전환 직후 커서를 끝으로 옮기며 생긴 스크롤 포함) 스크롤 위치를 맞춘다
  useLayoutEffect(() => {
    if (mirrorRef.current && memoTextareaRef.current) {
      mirrorRef.current.scrollTop = memoTextareaRef.current.scrollTop
    }
  }, [isEditMirror, noteText])

  const syncCaret = (textarea: HTMLTextAreaElement) => {
    setCaretPos(textarea.selectionStart === textarea.selectionEnd ? textarea.selectionStart : null)
  }

  // 사용자 제스처 안에서 바로 focus해야 iOS가 키보드를 띄운다
  const startEditing = () => {
    const textarea = memoTextareaRef.current
    onEditNote()
    if (!textarea) return
    // React 재렌더 전에 focus하므로 숨김 속성을 먼저 직접 걷어 스크린리더가 편집 입력창을 안내하게 한다
    textarea.readOnly = false
    textarea.removeAttribute('aria-hidden')
    textarea.tabIndex = 0
    textarea.focus()
    const length = textarea.value.length
    textarea.setSelectionRange(length, length)
  }

  // 저장된 메모가 있을 때만 편집 중 Escape가 되돌리기다. 새 메모는 되돌릴 글이 없어 보기 모드처럼 닫는다(닫으면 저장한다)
  const handleEscape = () => {
    if (isSaving) return
    if (noteEditMode && noteTodo?.note) onCancelEdit()
    else onClose()
  }

  return (
    <BottomSheet
      isOpen={isOpen}
      // 저장 중에 닫으면 실패했을 때 입력이 사라지므로 닫기를 막는다
      onClose={isSaving ? () => {} : onClose}
      onEscape={handleEscape}
      title={title}
      // 메모와 회고는 같은 편집 규칙을 쓴다(사용자 결정 2026-10-21): 제목 줄 왼쪽에 빨간 "삭제"(저장된 메모가 있으면 보기에서도),
      // 오른쪽 끝에 주 행동을 둔다. 보기에서는 파란 "수정", 고치는 중에는 그 자리가 초록 "저장"이 된다. 글자를 눌러 고치는 길도 그대로다
      headerLeading={
        noteTodo?.note ? (
          <Button variant="danger" size="sm" onClick={onDeleteNote} disabled={isSaving}>
            삭제
          </Button>
        ) : undefined
      }
      headerAction={
        noteEditMode ? (
          <Button variant="accent" size="sm" onClick={onSaveNote} disabled={isSaving}>
            저장
          </Button>
        ) : (
          // 보기 모드 textarea는 Tab에서 빠져 있어 키보드로 편집에 들어가는 길은 이 버튼이다
          <Button
            variant="info"
            size="sm"
            aria-label={noteTodo ? `${noteTodo.title} 메모 수정` : '메모 수정'}
            onClick={startEditing}
            disabled={isSaving}
          >
            수정
          </Button>
        )
      }
    >
      <div className="relative">
        {/* 편집 미러: textarea와 박스·글꼴·줄바꿈 규칙을 똑같이 맞춘다(<wbr> 없음, 스크롤바 자리 고정, iOS 16px) */}
        {isEditMirror && (
          <div
            ref={mirrorRef}
            aria-hidden
            className={`pointer-events-none absolute inset-0 overflow-hidden ${BOX} border-transparent bg-surface-sunken ${userTextInputClass} whitespace-pre-wrap break-words text-text-primary [scrollbar-gutter:stable] supports-[-webkit-touch-callout:none]:text-base`}
          >
            {linkifyText(noteText, { pathBreaks: false })}
            {/* textarea는 끝 줄바꿈 뒤 빈 줄을 그리지만 div는 안 그리므로 높이를 맞춘다 */}
            {'​'}
          </div>
        )}
        <textarea
          ref={memoTextareaRef}
          value={noteText}
          aria-label={`${title} 메모`}
          onChange={(e) => {
            onNoteTextChange(e.target.value)
            syncCaret(e.target)
          }}
          onSelect={(e) => syncCaret(e.currentTarget)}
          onScroll={(e) => {
            if (mirrorRef.current) mirrorRef.current.scrollTop = e.currentTarget.scrollTop
          }}
          // 빈 메모는 덮개가 없으므로 textarea를 눌러 편집에 들어간다. 스크롤할 내용이 없어 pointerdown을 써도 된다
          onPointerDown={!noteEditMode && !isViewOverlay ? (e) => {
            e.preventDefault()
            startEditing()
          } : undefined}
          readOnly={!noteEditMode || isSaving}
          // 보기 모드에서는 빈 메모도 경계 없는 읽기 전용 입력창이라 Tab과 스크린리더 대상에서 뺀다(편집은 제목 줄의 수정 버튼이나 탭)
          tabIndex={noteEditMode ? undefined : -1}
          aria-hidden={!noteEditMode || undefined}
          placeholder="메모를 입력하세요"
          className={`relative block h-40 w-full resize-none ${BOX} ${userTextInputClass} outline-none placeholder:text-text-secondary [scrollbar-gutter:stable] ${
            noteEditMode
              ? 'border-text-tertiary focus:border-text-primary focus:ring-1 focus:ring-text-primary'
              : 'border-transparent'
          } ${
            // 미러가 있으면 배경은 뒤의 미러가 칠하고 textarea는 투명하게 둬 링크 색이 보이게 한다
            isEditMirror
              ? 'bg-transparent text-transparent caret-text-primary'
              : noteEditMode
                ? 'bg-surface-sunken text-text-primary'
                : 'bg-transparent text-text-primary'
          } ${isViewOverlay ? 'opacity-0' : ''}`}
        />
        {/* 보기 모드: 링크를 누를 수 있게 textarea 위에 같은 모양의 글자를 덮는다(상자 없음).
            click은 스크롤한 터치에서는 발생하지 않으므로, 긴 메모를 스크롤해도 편집으로 넘어가지 않는다.
            iOS는 전역 규칙으로 textarea가 16px이라 덮개 글자 크기도 맞춘다 */}
        {isViewOverlay && (
          <div
            onClick={(e) => {
              if ((e.target as HTMLElement).closest('a')) return
              // 복사하려고 드래그로 선택한 경우는 편집으로 넘어가지 않는다
              if (window.getSelection()?.toString()) return
              startEditing()
            }}
            className={`absolute inset-0 cursor-text overflow-y-auto ${BOX} border-transparent [scrollbar-gutter:stable] ${userTextDisplayClass} text-text-primary supports-[-webkit-touch-callout:none]:text-base`}
          >
            {linkifyText(noteText)}
          </div>
        )}
      </div>
      {/* 편집 중에는 링크 열기 줄 자리를 늘 잡아 둬 커서가 링크를 드나들 때 시트 높이가 흔들리지 않게 한다 */}
      {noteEditMode && (
        <div className="mt-list flex min-h-11 items-center">
          {activeUrl && (
            <a
              href={activeUrl}
              target="_blank"
              rel="noopener noreferrer nofollow"
              title={activeUrl}
              // 데스크톱에서 누를 때 textarea 포커스(커서 위치)를 잃지 않게 한다
              onMouseDown={(e) => e.preventDefault()}
              className="inline-flex min-h-11 min-w-0 max-w-full items-center gap-2 text-sm leading-6"
            >
              <span className="shrink-0 font-medium text-accent-text">링크 열기</span>
              <span className="truncate text-text-secondary">{activeUrl.replace(/^https?:\/\//i, '')}</span>
            </a>
          )}
        </div>
      )}
    </BottomSheet>
  )
}
