import type { ReactNode } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { Button } from '../../../ui/Button'
import { PlusIcon } from '../../../ui/Icons'
import type { DropContainerId } from '../useDragAndDrop'

export function ActiveSectionDrop({
  id,
  className,
  children,
}: {
  id: DropContainerId
  className?: string
  children: ReactNode | ((isOver: boolean) => ReactNode)
}) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <section ref={setNodeRef} className={className}>
      {typeof children === 'function' ? children(isOver) : children}
    </section>
  )
}

// 오늘 비어 있는 지금 구간의 안내 카드: 인사 문구 + "오후에 추가" 버튼. 사용자 결정(2026-10-20)으로 바꾸기 전 카드를 되살렸다.
// .impeccable.md §9 인사형 금지, A6 그라디언트 금지와 다른 한 곳이다(면 토큰 사이의 옅은 세로 그라디언트)
export function SectionGuideCard({
  greeting,
  question,
  ctaLabel,
  onAdd,
}: {
  greeting: string
  question: string
  ctaLabel: string
  onAdd: () => void
}) {
  return (
    // 구간 글자 열(+40)부터 내용 오른쪽 선까지 둔다. 안쪽 왼쪽은 카드와 같은 16, 위는 구간 머리 아래 첫 할 일 행의 윗 여백(12)과 같고, 아래는 구분선까지 12(행 아래 여백과 같다)
    <div className="mb-card-item mt-card-item ml-10 rounded-card border border-border-subtle bg-linear-to-b from-surface-base to-surface-card px-card py-card-item">
      {/* 인사 한 줄, 줄을 바꿔 묻는 말 */}
      <p className="break-keep text-sm font-semibold text-text-primary">
        <span>{greeting}</span>
        <br />
        <span>{question}</span>
      </p>
      <Button size="sm" pill className="mt-list" icon={<PlusIcon className="h-4 w-4" />} onClick={onAdd}>
        {ctaLabel}
      </Button>
    </div>
  )
}

// 다른 구간에서 끌어온 할 일이 놓일 자리
export function CrossSectionPreviewSlot() {
  return (
    <li aria-hidden className="pointer-events-none py-tight">
      <div className="h-11 rounded-control border-2 border-accent" />
    </li>
  )
}
