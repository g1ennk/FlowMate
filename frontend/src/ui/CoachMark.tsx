import type { ReactNode } from 'react'
import { CloseIcon } from './Icons'
import { IconButton } from './IconButton'

// 앱 전체에서 1개까지(계획 탭) 쓰는 안내. 가리키는 UI가 화면에 있을 때만 visible을 켠다.
// message에는 가리키는 아이콘을 글자 사이에 넣을 수 있다. 닫기는 IconButton(터치 48)이다.

type CoachMarkProps = {
  message: ReactNode
  visible: boolean
  onDismiss: () => void
  className?: string
}

export function CoachMark({ message, visible, onDismiss, className = '' }: CoachMarkProps) {
  if (!visible) return null

  return (
    <div className={`flex items-start gap-list rounded-control bg-accent-subtle py-list pl-card-item pr-list ${className}`}>
      <p className="min-w-0 flex-1 break-keep py-tight text-sm text-accent-text">{message}</p>
      <IconButton label="힌트 닫기" onClick={onDismiss}>
        <CloseIcon />
      </IconButton>
    </div>
  )
}
