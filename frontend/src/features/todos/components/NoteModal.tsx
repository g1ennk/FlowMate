import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { BottomSheet } from '../../../ui/BottomSheet'
import { userTextDisplayClass, userTextInputClass } from '../../../lib/userTextStyles'
import type { Todo } from '../../../api/types'
import { findUrls, linkifyText } from '../linkifyText'

type NoteModalProps = {
  isOpen: boolean
  onClose: () => void
  noteEditMode: boolean
  noteTodo: Todo | null
  noteText: string
  isSaving?: boolean
  onNoteTextChange: (text: string) => void
  onDeleteNote: () => void
  onSaveNote: () => void
  onEditNote: () => void
}

export function NoteModal({
  isOpen,
  onClose,
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
  // 다크 모드 배경이 반투명이라 덮개 아래 textarea는 opacity-0으로 숨긴다 (포커스는 가능)
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

  return (
    <BottomSheet
      isOpen={isOpen}
      // 저장 중에 닫으면 실패했을 때 입력이 사라지므로 닫기를 막는다
      onClose={isSaving ? () => {} : onClose}
      panelClassName="min-h-[50dvh]"
    >
      <div className="mb-4 -mt-2">
        <div className="grid grid-cols-[56px_minmax(0,1fr)_56px] items-center gap-2">
          {noteEditMode ? (
            <>
              <button
                onClick={onDeleteNote}
                disabled={isSaving}
                className="h-8 w-14 justify-self-start whitespace-nowrap rounded-md text-sm font-medium text-state-error transition-colors hover:bg-state-error-subtle hover:text-state-error-text disabled:opacity-50"
              >
                삭제
              </button>
              <h3
                className="min-w-0 truncate text-center text-base font-semibold text-text-primary"
                title={title}
              >
                {title}
              </h3>
              <button
                onClick={onSaveNote}
                disabled={isSaving}
                className="h-8 w-14 justify-self-end whitespace-nowrap rounded-md text-sm font-medium text-text-primary transition-colors hover:bg-hover-strong hover:text-text-secondary disabled:opacity-50"
              >
                저장
              </button>
            </>
          ) : (
            <>
              <div className="h-8 w-14" />
              <h3
                className="min-w-0 truncate text-center text-base font-semibold text-text-primary"
                title={title}
              >
                {title}
              </h3>
              <button
                onClick={startEditing}
                className="h-8 w-14 justify-self-end whitespace-nowrap rounded-md text-sm font-medium text-text-primary transition-colors hover:bg-hover-strong hover:text-text-secondary"
              >
                편집
              </button>
            </>
          )}
        </div>
      </div>

      <div className="relative mb-2">
        {/* 편집 미러: textarea와 박스·글꼴·줄바꿈 규칙을 똑같이 맞춘다(<wbr> 없음, 스크롤바 자리 고정, iOS 16px) */}
        {isEditMirror && (
          <div
            ref={mirrorRef}
            aria-hidden
            className={`pointer-events-none absolute inset-0 overflow-hidden rounded-xl bg-state-warning-subtle border border-transparent p-3 ${userTextInputClass} whitespace-pre-wrap break-words text-text-secondary [scrollbar-gutter:stable] supports-[-webkit-touch-callout:none]:text-base`}
          >
            {linkifyText(noteText, { pathBreaks: false })}
            {/* textarea는 끝 줄바꿈 뒤 빈 줄을 그리지만 div는 안 그리므로 높이를 맞춘다 */}
            {'\u200b'}
          </div>
        )}
        <textarea
          ref={memoTextareaRef}
          value={noteText}
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
          tabIndex={isViewOverlay ? -1 : undefined}
          aria-hidden={isViewOverlay || undefined}
          placeholder="메모를 입력하세요..."
          className={`relative block h-40 w-full resize-none rounded-xl border border-[var(--color-warning)] p-3 ${userTextInputClass} outline-none placeholder:text-text-tertiary [scrollbar-gutter:stable] ${
            isEditMirror
              ? 'bg-transparent text-transparent caret-text-secondary'
              : 'bg-state-warning-subtle text-text-secondary'
          } ${isViewOverlay ? 'opacity-0' : ''}`}
        />
        {/* 보기 모드: 링크를 누를 수 있게 textarea 위에 같은 모양의 텍스트를 덮는다.
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
            className={`absolute inset-0 cursor-text overflow-y-auto rounded-xl [scrollbar-gutter:stable] bg-state-warning-subtle border border-[var(--color-warning)] p-3 ${userTextDisplayClass} text-text-secondary supports-[-webkit-touch-callout:none]:text-base`}
          >
            {linkifyText(noteText)}
          </div>
        )}
      </div>
      {/* 높이를 미리 잡아 둬 버튼이 나타나고 사라질 때 아래 내용이 흔들리지 않게 한다 */}
      {noteEditMode && (
        <div className="mb-4 h-6 px-1">
          {activeUrl && (
            <a
              href={activeUrl}
              target="_blank"
              rel="noopener noreferrer nofollow"
              title={activeUrl}
              // 데스크톱에서 누를 때 textarea 포커스(커서 위치)를 잃지 않게 한다
              onMouseDown={(e) => e.preventDefault()}
              className="inline-flex max-w-full items-center gap-2 text-sm leading-6"
            >
              <span className="shrink-0 font-medium text-accent-text">링크 열기</span>
              <span className="truncate text-text-tertiary">{activeUrl.replace(/^https?:\/\//i, '')}</span>
            </a>
          )}
        </div>
      )}
      {!noteEditMode && (
        <p className="mb-4 px-1 text-xs text-text-tertiary">
          탭하면 바로 편집 모드로 전환됩니다
        </p>
      )}
    </BottomSheet>
  )
}
