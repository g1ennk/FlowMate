import { CloseIcon } from './Icons'

type CoachMarkProps = {
  message: string
  visible: boolean
  onDismiss: () => void
  className?: string
}

export function CoachMark({ message, visible, onDismiss, className = '' }: CoachMarkProps) {
  if (!visible) return null

  return (
    <div className={`flex items-start gap-2 rounded-xl bg-accent-subtle px-3 py-2.5 animate-fade-in-up ${className}`}>
      <p className="flex-1 whitespace-pre-line text-xs leading-relaxed text-accent-text">{message}</p>
      <button
        onClick={onDismiss}
        className="-m-1.5 flex shrink-0 items-center justify-center rounded-full p-1.5 text-accent-text/60 hover:text-accent-text"
        aria-label="힌트 닫기"
      >
        <CloseIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
