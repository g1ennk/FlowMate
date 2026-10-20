import { useLayoutEffect, useRef } from 'react'
import { Button } from '../../../ui/Button'

const OFFSET_VAR = '--batch-bar-offset'
// 하단 탭과 바 사이 간격(아래 bottom의 0.75rem)
const BAR_GAP_PX = 12

type BatchActionBarProps = {
  selectedCount: number
  onComplete: () => void
  onDelete: () => void
}

// 선택 모드 동안 하단 탭 위에 뜨는 바. 본문과 같은 폭과 여백(max-w-lg, page-x)으로 띄우고 shadow-float를 준다.
// 아무것도 고르지 않았어도 보이고 무엇을 하는 바인지 알린다. 선택 모드를 끝내는 "완료"는 제목 줄에 있다.
// 안쪽 양옆은 카드와 같은 16이다: 왼쪽 글자와 오른쪽 주 버튼 면이 같은 거리에 온다(Task 21)
export function BatchActionBar({ selectedCount, onComplete, onDelete }: BatchActionBarProps) {
  const ref = useRef<HTMLDivElement>(null)
  const hasSelection = selectedCount > 0

  // 떠 있는 동안 토스트가 바 위로 뜨도록 바 높이 + 간격을 알린다 (globals.css --toast-bottom-offset)
  useLayoutEffect(() => {
    const root = document.documentElement
    const measure = () => root.style.setProperty(OFFSET_VAR, `${(ref.current?.offsetHeight ?? 0) + BAR_GAP_PX}px`)
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    if (ref.current) observer?.observe(ref.current)
    return () => {
      observer?.disconnect()
      root.style.removeProperty(OFFSET_VAR)
    }
  }, [])

  return (
    <div
      ref={ref}
      className="fixed inset-x-0 z-50 mx-auto w-full max-w-lg px-page-x"
      style={{
        bottom: 'calc(var(--bottom-nav-height) + var(--safe-bottom) + 0.75rem)',
      }}
    >
      <div className="flex items-center justify-between gap-card-item rounded-card bg-surface-card px-card py-list shadow-float">
        <p aria-live="polite" className="min-w-0 break-keep text-sm font-medium text-text-secondary">
          {hasSelection ? `${selectedCount}개 선택` : '선택한 할 일이 없어요'}
        </p>
        <div className="flex shrink-0 items-center gap-list">
          <Button variant="danger" size="sm" onClick={onDelete} disabled={!hasSelection}>
            삭제
          </Button>
          <Button size="sm" onClick={onComplete} disabled={!hasSelection}>
            완료 처리
          </Button>
        </div>
      </div>
    </div>
  )
}
