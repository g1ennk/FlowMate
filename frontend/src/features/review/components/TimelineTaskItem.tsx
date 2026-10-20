import { ListRow } from '../../../ui/ListRow'
import { CheckIcon, ChevronRightIcon } from '../../../ui/Icons'
import type { TaskItem } from '../reviewTypes'

// 기록 속 할 일 한 줄. 누르면 세션 상세가 열린다(오른쪽 화살표).
// 행 사이 선은 긋지 않는다. 묶음 머리(GroupCaption)의 가로선이 묶음을 나눈다(사용자 결정 2026-10-20, 바꾸기 전 모양).
// 완료는 체크 아이콘만 둔다. 계획 화면의 체크 원과 달라야 눌러서 완료를 바꿀 수 있을 것처럼 보이지 않는다.
export function TimelineTaskItem({ item, onSelect }: { item: TaskItem; onSelect?: (item: TaskItem) => void }) {
  const timeLabel = item.focusSeconds >= 60 ? item.focusTime : '-'

  return (
    <ListRow
      divider={false}
      onClick={() => onSelect?.(item)}
      leading={
        <span className="flex h-5 w-5 items-center justify-center">
          {item.isDone && <CheckIcon className="h-4 w-4 text-accent" />}
        </span>
      }
      label={
        <>
          {item.title}
          {item.isDone && <span className="sr-only">, 완료</span>}
        </>
      }
      trailing={
        <>
          <span className="whitespace-nowrap text-xs">{timeLabel}</span>
          <ChevronRightIcon className="h-4 w-4" />
        </>
      }
    />
  )
}
