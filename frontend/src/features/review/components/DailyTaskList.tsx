import { useNavigate } from 'react-router-dom'
import type { TaskItem } from '../reviewTypes'
import { Card } from '../../../ui/Card'
import { EmptyState } from '../../../ui/EmptyState'
import { SectionHeader } from '../../../ui/SectionHeader'
import { systemMessages } from '../../../lib/messages'
import { MiniDayTaskGroups } from './MiniDayTaskGroups'

type DailyTaskListProps = {
  tasks: TaskItem[]
  isToday?: boolean
  miniDayLabels: Array<{ id: number; label: string }>
  onSelectTask?: (task: TaskItem) => void
}

// 일간 할 일 기록. 카드 밖 섹션 제목 + 목록(빈 상태도) 카드 한 장, 미니데이 구간 순서로 묶는다(§2-1)
export function DailyTaskList({
  tasks,
  isToday = true,
  miniDayLabels,
  onSelectTask,
}: DailyTaskListProps) {
  const navigate = useNavigate()

  return (
    <section>
      <SectionHeader title={isToday ? '오늘의 할 일' : '할 일'} />
      {tasks.length === 0 ? (
        <Card>
          {isToday ? (
            <EmptyState
              message="오늘은 아직 할 일이 없어요"
              actionLabel={systemMessages.goToPlan}
              onAction={() => navigate('/todos')}
              className="py-0"
            />
          ) : (
            <EmptyState message="이날은 할 일이 없어요" className="py-0" />
          )}
        </Card>
      ) : (
        <Card>
          <MiniDayTaskGroups tasks={tasks} miniDayLabels={miniDayLabels} onSelectTask={onSelectTask} />
        </Card>
      )}
    </section>
  )
}
