import type { ReactNode } from 'react'

// 회고 할 일 목록의 묶음 머리(미니데이 구간, 월간의 날짜). 작은 라벨 오른쪽으로 가는 가로선(border-default)이
// 카드 안쪽 오른쪽 끝까지 이어져 묶음을 나눈다(사용자 결정 2026-10-20, 바꾸기 전 모양).
// 라벨은 할 일 글자 열보다 왼쪽, 카드 안쪽 여백 선(체크 열 시작)에서 시작해 묶음이 확실히 구분된다
export function GroupCaption({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-list">
      <p className="shrink-0 text-xs font-medium text-text-secondary">{children}</p>
      <span aria-hidden="true" className="h-px flex-1 bg-border-default" />
    </div>
  )
}
