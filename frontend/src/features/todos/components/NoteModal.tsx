import { useEffect, useRef } from 'react'
import { BottomSheet } from '../../../ui/BottomSheet'
import { userTextInputClass } from '../../../lib/userTextStyles'
import type { Todo } from '../../../api/types'

type NoteModalProps = {
  isOpen: boolean
  onClose: () => void
  noteEditMode: boolean
  noteTodo: Todo | null
  noteText: string
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
  onNoteTextChange,
  onDeleteNote,
  onSaveNote,
  onEditNote,
}: NoteModalProps) {
  const memoTextareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (noteEditMode && memoTextareaRef.current) {
      memoTextareaRef.current.focus()
      const length = memoTextareaRef.current.value.length
      memoTextareaRef.current.setSelectionRange(length, length)
    }
  }, [noteEditMode])

  const title = noteTodo ? noteTodo.title : '메모'

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      panelClassName="min-h-[50dvh]"
    >
      <div className="mb-4 -mt-2">
        <div className="grid grid-cols-[56px_minmax(0,1fr)_56px] items-center gap-2">
          {noteEditMode ? (
            <>
              <button
                onClick={onDeleteNote}
                className="h-8 w-14 justify-self-start whitespace-nowrap rounded-md text-sm font-medium text-state-error transition-colors hover:bg-state-error-subtle hover:text-state-error-text"
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
                className="h-8 w-14 justify-self-end whitespace-nowrap rounded-md text-sm font-medium text-text-primary transition-colors hover:bg-hover-strong hover:text-text-secondary"
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
              <div className="h-8 w-14" />
            </>
          )}
        </div>
      </div>

      <textarea
        ref={memoTextareaRef}
        value={noteText}
        onChange={(e) => onNoteTextChange(e.target.value)}
        onPointerDown={!noteEditMode ? (e) => {
          const target = e.currentTarget
          e.preventDefault()
          onEditNote()
          target.readOnly = false
          target.focus()
          const length = target.value.length
          target.setSelectionRange(length, length)
        } : undefined}
        readOnly={!noteEditMode}
        placeholder="메모를 입력하세요..."
        className={`mb-2 h-40 w-full resize-none rounded-xl bg-state-warning-subtle border border-[var(--color-warning)] p-3 ${userTextInputClass} text-text-secondary outline-none placeholder:text-text-tertiary ${
          !noteEditMode ? 'cursor-pointer' : ''
        }`}
      />
      {!noteEditMode && (
        <p className="mb-4 px-1 text-xs text-text-tertiary">
          탭하면 바로 편집 모드로 전환됩니다
        </p>
      )}
    </BottomSheet>
  )
}
