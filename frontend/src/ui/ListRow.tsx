import type { ReactNode } from 'react'

// 목록 한 줄: 왼쪽(체크나 아이콘) + 라벨 + 오른쪽(값, 화살표, IconButton). 최소 44px.
// onClick을 주면 행 전체가 버튼이 된다. 그때 trailing에는 버튼을 넣지 않는다(버튼 안에 버튼 금지).
// 정렬(Task 21): 앞 표지는 32 칸(IconButton 폭) 가운데에 두고, 글자 열은 그 뒤 8(gap-list)에서 시작한다.
// 계획 목록(체크, 구간 화살표)과 같은 열이다. 오른쪽 값과 화살표는 행 오른쪽 끝(카드 안쪽 선)에 붙는다.
// 행 사이 구분선(border-subtle)은 글자 열부터 긋는다. 앞 표지가 없으면 글자 열이 곧 행 왼쪽이라 행 폭 전체다.
// 첫 행에는 긋지 않는다(카드 테두리와 겹치지 않게). hover 면만 의사 요소로 양옆 8px 넓힌다.
// divider={false}면 행 사이 선을 긋지 않는다. 묶음 머리 선이 구분을 맡는 목록(회고 미니데이 묶음)에서 쓴다.
// size="lg"는 설정 행(48px)이다(§6-2).

type ListRowProps = {
  label: ReactNode
  description?: ReactNode
  leading?: ReactNode
  trailing?: ReactNode
  onClick?: () => void
  disabled?: boolean
  danger?: boolean
  divider?: boolean
  size?: 'md' | 'lg'
  className?: string
}

const HEIGHT = { md: 'min-h-11', lg: 'min-h-12' }

const ROW =
  'group/row relative isolate flex w-full items-stretch gap-list text-left ' +
  'before:absolute before:-inset-x-2 before:inset-y-0 before:-z-10 before:rounded-control before:transition-colors'

// 글자 열: 라벨 + 오른쪽 값. 구분선을 여기에 그어 글자 열부터 시작하게 한다
const BODY = 'flex min-w-0 flex-1 items-center gap-card-item py-2'
const DIVIDER = 'border-t border-border-subtle group-first/row:border-t-0'

export function ListRow({
  label,
  description,
  leading,
  trailing,
  onClick,
  disabled = false,
  danger = false,
  divider = true,
  size = 'md',
  className = '',
}: ListRowProps) {
  const row = `${ROW} ${HEIGHT[size]}`
  const body = (
    <>
      {leading && <span className="flex w-8 shrink-0 items-center justify-center text-text-secondary">{leading}</span>}
      <span data-list-row-body className={divider ? `${BODY} ${DIVIDER}` : BODY}>
        <span className="min-w-0 flex-1">
          <span className={`block break-keep text-sm ${danger ? 'text-state-error-text' : 'text-text-primary'}`}>{label}</span>
          {description && <span className="mt-tight block text-xs text-text-secondary">{description}</span>}
        </span>
        {trailing && <span className="flex shrink-0 items-center gap-tight text-sm text-text-secondary">{trailing}</span>}
      </span>
    </>
  )

  if (!onClick) {
    return <div className={`${row} ${className}`}>{body}</div>
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${row} hover:not-disabled:before:bg-hover disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
    >
      {body}
    </button>
  )
}
