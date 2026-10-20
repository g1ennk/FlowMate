import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { SHORTCUTS } from '../lib/useKeyboardShortcuts'
import { CloseIcon } from './Icons'
import { IconButton } from './IconButton'
import { useOverlayLayer } from './overlayStack'

type KeyboardShortcutsHelpProps = {
  isOpen: boolean
  onClose: () => void
}

export function KeyboardShortcutsHelp({ isOpen, onClose }: KeyboardShortcutsHelpProps) {
  const backdropRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  // 열린 동안 오버레이 스택에 올린다(Escape로 닫기, 뒤 화면 inert, 스크롤 잠금)
  // 닫을 때 연 자리로 포커스를 돌려주는 일도 스택이 맡는다. 연 자리를 먼저 기억하도록 포커스 이동보다 앞에 둔다
  useOverlayLayer(isOpen, { onEscape: onClose, elementRef: dialogRef })

  // 열릴 때 대화상자 안으로 포커스를 옮긴다(BottomSheet와 같다)
  useEffect(() => {
    if (!isOpen) return
    const dialog = dialogRef.current
    if (dialog && !dialog.contains(document.activeElement)) dialog.focus({ preventScroll: true })
  }, [isOpen])

  if (!isOpen) return null

  return createPortal(
    <div
      ref={backdropRef}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-surface-overlay p-6"
      onClick={(e) => {
        if (e.target === backdropRef.current) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="keyboard-shortcuts-title"
        tabIndex={-1}
        className="w-full max-w-xs rounded-sheet bg-surface-card p-sheet shadow-float outline-none"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="keyboard-shortcuts-title" className="text-base font-semibold text-text-primary">키보드 단축키</h2>
          <IconButton label="닫기" onClick={onClose} className="-mr-1">
            <CloseIcon />
          </IconButton>
        </div>
        <ul className="space-y-3">
          {SHORTCUTS.map((s) => (
            <li key={s.key} className="flex items-center justify-between">
              <span className="text-sm text-text-secondary">{s.description}</span>
              {/* 키는 상자 없이 글자로 쓴다(28px 칸에 control 반경을 주면 원처럼 보여 알약 배지와 헷갈린다) */}
              <kbd className="min-w-7 text-right font-sans text-sm font-semibold text-text-primary">
                {s.label}
              </kbd>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-center text-xs text-text-tertiary">
          입력 중에는 단축키가 꺼져요
        </p>
      </div>
    </div>,
    document.body,
  )
}
