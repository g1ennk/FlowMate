import { CheckIcon, TrashIcon, CloseIcon } from '../../../ui/Icons'

type BatchActionBarProps = {
  selectedCount: number
  onComplete: () => void
  onDelete: () => void
  onCancel: () => void
}

export function BatchActionBar({ selectedCount, onComplete, onDelete, onCancel }: BatchActionBarProps) {
  if (selectedCount === 0) return null

  return (
    <div
      className="fixed inset-x-0 z-50 mx-auto flex w-full max-w-lg items-center justify-between rounded-2xl bg-surface-card px-card py-card-item shadow-lg"
      style={{
        bottom: 'calc(var(--bottom-nav-height) + var(--safe-bottom) + 0.75rem)',
      }}
    >
      <span className="text-sm font-medium text-text-secondary">
        {selectedCount}개 선택됨
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={onComplete}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-text-inverse transition-colors hover:bg-accent-hover"
        >
          <CheckIcon className="h-4 w-4" strokeWidth={2.5} />
          완료
        </button>
        <button
          onClick={onDelete}
          className="flex items-center gap-1.5 rounded-lg bg-state-error px-3 py-1.5 text-sm font-medium text-white transition-colors hover:opacity-90"
        >
          <TrashIcon className="h-4 w-4" />
          삭제
        </button>
        <button
          onClick={onCancel}
          className="flex h-10 w-10 items-center justify-center rounded-full text-text-tertiary hover:bg-hover-strong"
          aria-label="선택 취소"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
