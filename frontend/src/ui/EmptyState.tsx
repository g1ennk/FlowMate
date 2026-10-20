import { Button } from './Button'

// 빈 상태: 데이터로 말하는 한 줄(text-secondary) + 선택적 ghost 버튼.
// 그라디언트, 일러스트, 점선 박스는 쓰지 않는다.

type EmptyStateProps = {
  message: string
  actionLabel?: string
  onAction?: () => void
  className?: string
}

export function EmptyState({ message, actionLabel, onAction, className = '' }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-start gap-tight py-list ${className}`}>
      <p className="break-keep text-sm text-text-secondary">{message}</p>
      {actionLabel && onAction && (
        <Button variant="ghost" size="sm" className="-ml-3" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  )
}
