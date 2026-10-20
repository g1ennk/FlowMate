import type { ReactNode } from 'react'

// 탭마다 같은 높이(40)에 두는 page 제목. 탭별 컨트롤은 이 아래에 둔다.
// subtitle(계획: 오늘이 아닌 날의 "어제", "3일 후")과 meta(계획: 그날 집중 합계, 초록)는 제목 아래 작은 한 줄에
// "어제 · 집중 1시간 15분"처럼 같이 둔다. 둘 중 하나만 있으면 그것만 쓴다(사용자 결정 2026-10-20: 상대 날짜를 숨기지 않는다).
// 제목 줄 높이는 늘 24이고 머리 맨 위에 둔다. 아래 줄(16)이 있어도 머리 높이 40을 지켜 계획 첫 할 일 위치(H1)가 밀리지 않고,
// 아래 줄이 없는 탭(회고, 설정)과 제목 위치가 같다(H4).
// trailing에는 제목 줄 오른쪽에 붙는 작은 버튼(IconButton, ghost sm)만 넣는다. 아래 줄이 있어도 버튼은 제목 줄 가운데(12)에 맞춘다:
// 40 칸을 위로 8 올려(-mt-2) 칸 가운데가 제목 줄 가운데에 온다(목록 행의 앞뒤 표지를 첫 줄에 맞추는 것과 같은 규칙, Task 21).

type PageHeaderProps = {
  title: string
  subtitle?: string | null
  meta?: ReactNode
  trailing?: ReactNode
  className?: string
}

export function PageHeader({ title, subtitle, meta, trailing, className = '' }: PageHeaderProps) {
  const hasSubline = !!subtitle || !!meta
  return (
    <header className={`flex h-10 items-start justify-between gap-card-item ${className}`}>
      <div className="flex min-w-0 flex-col self-stretch justify-start">
        <h1 className="min-w-0 truncate text-xl font-bold leading-6 text-text-primary">{title}</h1>
        {hasSubline && (
          <p className="min-w-0 truncate text-xs leading-4 text-text-secondary">
            {subtitle && <span className="font-medium">{subtitle}</span>}
            {subtitle && meta && ' · '}
            {meta}
          </p>
        )}
      </div>
      {trailing && <div className="-mt-2 flex h-10 shrink-0 items-center gap-list self-start">{trailing}</div>}
    </header>
  )
}
