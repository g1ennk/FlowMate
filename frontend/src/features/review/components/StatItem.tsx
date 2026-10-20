import type { ReactNode } from 'react'

// 기록 숫자 하나(.impeccable.md §2-3): 큰 숫자는 stat(24/300, 고정폭) text-primary, 라벨은 그 아래 caption.
// 값이 없거나 0이면(muted) 흐린 글자로 둔다. emphasis면 핵심 숫자로 초록(accent-text) 30으로 키운다. 굵게는 하지 않는다(세션 상세, 사용자 결정 2026-10-20).

type StatItemProps = {
  value: string
  label: string
  muted?: boolean
  emphasis?: boolean
}

export function StatItem({ value, label, muted = false, emphasis = false }: StatItemProps) {
  return (
    <div className="min-w-0">
      {/* 줄 높이를 36으로 같게 둬 크기가 다른 칸끼리도 라벨 줄이 맞는다 */}
      <p
        className={`whitespace-nowrap leading-9 tabular-nums font-light ${emphasis ? 'text-3xl' : 'text-2xl'} ${
          muted ? 'text-text-tertiary' : emphasis ? 'text-accent-text' : 'text-text-primary'
        }`}
      >
        {value}
      </p>
      <p className="mt-tight text-xs font-medium text-text-secondary">{label}</p>
    </div>
  )
}

// 집중 시간 글자가 가장 길어서 첫 칸을 조금 넓게(1.4) 두되, 글자보다 좁아지지는 않게 한다
// (375px에서 "18시간 5분"도 옆 칸과 붙지 않게)
export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-[minmax(max-content,1.4fr)_1fr_1fr] gap-card">{children}</div>
}
