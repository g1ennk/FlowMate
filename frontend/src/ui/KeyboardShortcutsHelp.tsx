import { useRef } from 'react'
import { createPortal } from 'react-dom'
import { SHORTCUTS } from '../lib/useKeyboardShortcuts'
import { CloseIcon } from './Icons'

type KeyboardShortcutsHelpProps = {
  isOpen: boolean
  onClose: () => void
}

export function KeyboardShortcutsHelp({ isOpen, onClose }: KeyboardShortcutsHelpProps) {
  const backdropRef = useRef<HTMLDivElement>(null)

  // Escape 처리는 useKeyboardShortcuts 훅에서 일괄 담당

  if (!isOpen) return null

  return createPortal(
    <div
      ref={backdropRef}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-6 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === backdropRef.current) onClose()
      }}
    >
      <div className="w-full max-w-xs animate-fade-in-up rounded-2xl bg-surface-card p-sheet shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-primary">키보드 단축키</h2>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full text-text-tertiary hover:bg-hover-strong"
            aria-label="닫기"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
        <ul className="space-y-2.5">
          {SHORTCUTS.map((s) => (
            <li key={s.key} className="flex items-center justify-between">
              <span className="text-sm text-text-secondary">{s.description}</span>
              <kbd className="flex h-6 min-w-[24px] items-center justify-center rounded-md border border-border-default bg-surface-base px-1.5 text-xs font-medium text-text-secondary">
                {s.label}
              </kbd>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-center text-xs text-text-tertiary">
          입력 필드가 활성화되면 단축키가 비활성화됩니다
        </p>
      </div>
    </div>,
    document.body,
  )
}
