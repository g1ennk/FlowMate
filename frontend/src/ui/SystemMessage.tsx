import type { ReactNode } from 'react'
import { Button } from './Button'

// 막혔을 때 다음 행동 하나를 알려 주는 화면(.impeccable.md §7 SystemMessage).
// 서버 없음, 로그인 복원 실패, 404, 오류, 업데이트가 같이 쓴다.
// 제목 16/600 + 본문 14 secondary + primary 버튼 1개 + 선택 ghost 1개. 아이콘 원 없이 세로 가운데에 둔다.
// placement="layout"은 하단 탭이 있는 레이아웃 안(main의 위아래 여백과 탭을 뺀 높이)에서 가운데에 둔다.

type SystemMessageAction = {
  label: string
  onClick?: () => void
  // 주면 링크(<Link>)로 그린다
  to?: string
  disabled?: boolean
}

type SystemMessageProps = {
  title: string
  body: ReactNode
  primary: SystemMessageAction
  secondary?: SystemMessageAction
  placement?: 'screen' | 'layout'
}

function ActionButton({ action, variant, className }: {
  action: SystemMessageAction
  variant: 'primary' | 'ghost'
  className?: string
}) {
  if (action.to) {
    return (
      <Button variant={variant} to={action.to} className={className}>
        {action.label}
      </Button>
    )
  }
  return (
    <Button variant={variant} onClick={action.onClick} disabled={action.disabled} className={className}>
      {action.label}
    </Button>
  )
}

export function SystemMessage({ title, body, primary, secondary, placement = 'screen' }: SystemMessageProps) {
  const isScreen = placement === 'screen'

  return (
    <div
      className={`mx-auto flex w-full max-w-lg flex-col items-center justify-center text-center ${
        isScreen ? 'min-h-dvh bg-surface-base px-page-x py-page-y' : ''
      }`}
      style={
        isScreen
          ? undefined
          : { minHeight: 'calc(100dvh - var(--bottom-nav-height) - var(--safe-bottom) - 2 * var(--spacing-page-y))' }
      }
    >
      <h1 className="text-base font-semibold text-text-primary">{title}</h1>
      <p className="mt-list max-w-xs break-keep text-sm text-text-secondary">{body}</p>
      <ActionButton action={primary} variant="primary" className="mt-section" />
      {secondary && <ActionButton action={secondary} variant="ghost" className="mt-list" />}
    </div>
  )
}
