import type { TaskItem } from '../reviewTypes'
import { GroupCaption } from './GroupCaption'
import { TimelineTaskItem } from './TimelineTaskItem'

type MiniDayTaskGroupsProps = {
  tasks: TaskItem[]
  miniDayLabels: Array<{ id: number; label: string }>
  onSelectTask?: (task: TaskItem) => void
}

// 할 일을 미니데이 구간 순서로 묶어 보여 준다(§2-1). 구간 이름 오른쪽으로 가로선을 그어 묶음을 나누고(GroupCaption),
// 묶음 안 할 일 행 사이에는 선을 긋지 않는다.
// 구간 안에서는 완료한 할 일을 먼저 둔다.
export function MiniDayTaskGroups({ tasks, miniDayLabels, onSelectTask }: MiniDayTaskGroupsProps) {
  const groups = miniDayLabels
    .map((group) => {
      const items = tasks.filter((item) => (item.miniDay ?? 0) === group.id)
      return { ...group, items: [...items.filter((i) => i.isDone), ...items.filter((i) => !i.isDone)] }
    })
    .filter((group) => group.items.length > 0)

  return (
    <div className="space-y-list">
      {groups.map((group) => (
        <div key={group.id}>
          <GroupCaption>{group.label}</GroupCaption>
          <div>
            {group.items.map((item) => (
              <TimelineTaskItem key={item.id} item={item} onSelect={onSelectTask} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
