import type { ReactNode } from 'react'
import { Button } from './Button'

// 섹션 제목. 앱 전체에서 이 한 가지만 쓴다.
// md: 카드 밖에 두는 섹션 제목(16/600, text-primary). 오른쪽 액션은 ghost sm 버튼이고, 글자가 카드 오른쪽 끝에 맞도록 버튼 여백만큼 밖으로 뺀다.
// sm: 시트 안에서 묶음을 나누는 제목(14/600, secondary). 시트 제목(16/600)보다 한 단계 낮다.
// tone="timer"는 늘 어두운 타이머 시트 안에서 쓴다(timer-* 토큰만, §4-3). meta는 오른쪽에 두는 값 글자다(예: 사운드 비율 "반반").
// trailing은 버튼이 여럿인 제목 줄(회고의 "삭제"와 "수정" 또는 "저장")에서 action 대신 오른쪽에 둔다.
// titleTrailing은 제목 바로 옆에 붙는 버튼이다(회고의 "AI 리포트"). 오른쪽 버튼이 생기고 사라져도 자리가 바뀌지 않는다.

type SectionHeaderProps = {
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
  actionDisabled?: boolean
  trailing?: ReactNode
  titleTrailing?: ReactNode
  meta?: string
  size?: 'md' | 'sm'
  tone?: 'surface' | 'timer'
  as?: 'h2' | 'h3'
  // 묶음을 role="group" aria-labelledby로 이름 붙일 때 쓴다
  id?: string
  className?: string
}

const TITLE = {
  surface: { md: 'text-base text-text-primary', sm: 'text-sm text-text-secondary' },
  timer: { md: 'text-base text-timer-modal-text', sm: 'text-sm text-timer-modal-secondary' },
}
const META = { surface: 'text-text-secondary', timer: 'text-timer-modal-secondary' }

export function SectionHeader({
  title,
  description,
  actionLabel,
  onAction,
  actionDisabled = false,
  trailing,
  titleTrailing,
  meta,
  size = 'md',
  tone = 'surface',
  as: Heading = 'h2',
  id,
  className = '',
}: SectionHeaderProps) {
  const hasAction = !!actionLabel && !!onAction
  // md는 액션이 없어도 같은 높이(36)를 지켜 섹션 사이 리듬이 같다. sm은 글자 줄 높이만 쓴다
  const rowHeight = size === 'md' || hasAction || trailing || titleTrailing ? 'min-h-9' : ''
  return (
    <div className={`${size === 'md' ? 'mb-list' : 'mb-tight'} ${className}`}>
      <div className={`flex items-center justify-between gap-card-item ${rowHeight}`}>
        {titleTrailing ? (
          <div className="flex min-w-0 items-center gap-tight">
            <Heading id={id} className={`min-w-0 truncate font-semibold ${TITLE[tone][size]}`}>{title}</Heading>
            {titleTrailing}
          </div>
        ) : (
          <Heading id={id} className={`min-w-0 truncate font-semibold ${TITLE[tone][size]}`}>{title}</Heading>
        )}
        {meta && <span className={`shrink-0 text-sm ${META[tone]}`}>{meta}</span>}
        {trailing && <div className="flex shrink-0 items-center gap-tight">{trailing}</div>}
        {!trailing && hasAction && (
          <Button variant="ghost" size="sm" tone={tone} className="-mr-3" onClick={onAction} disabled={actionDisabled}>
            {actionLabel}
          </Button>
        )}
      </div>
      {description && <p className={`text-xs ${META[tone]}`}>{description}</p>}
    </div>
  )
}
