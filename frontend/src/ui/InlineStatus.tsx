import { Button } from './Button'

// 불러오지 못했거나 오프라인이라 기다리는 상태를 알리는 한 줄. 앱 전체에서 이 한 가지만 쓴다.
// 상자에 담지 않는다(§3-2): secondary 글자 한 줄 + 오른쪽에 선택적 ghost sm "다시 시도".
// kind: error(실패, role=alert) | waiting(오프라인 대기처럼 저절로 풀리는 상태, role=status)

type InlineStatusProps = {
  message: string
  kind?: 'error' | 'waiting'
  actionLabel?: string
  onAction?: () => void
  actionDisabled?: boolean
  className?: string
}

export function InlineStatus({
  message,
  kind = 'error',
  actionLabel,
  onAction,
  actionDisabled = false,
  className = '',
}: InlineStatusProps) {
  const hasAction = !!actionLabel && !!onAction
  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      className={`flex items-center justify-between gap-card-item ${hasAction ? 'min-h-11' : ''} ${className}`}
    >
      <p className="min-w-0 break-keep text-sm text-text-secondary">{message}</p>
      {hasAction && (
        <Button variant="ghost" size="sm" className="-mr-3" onClick={onAction} disabled={actionDisabled}>
          {actionLabel}
        </Button>
      )}
    </div>
  )
}
