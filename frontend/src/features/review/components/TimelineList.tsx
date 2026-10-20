import { useState, type ReactNode } from 'react'
import type { TimelineGroupData, TaskItem } from '../reviewTypes'
import { buildMonthWeekGroups } from '../reviewUtils'
import { Card } from '../../../ui/Card'
import { EmptyState } from '../../../ui/EmptyState'
import { SectionHeader } from '../../../ui/SectionHeader'
import { ChevronRightIcon } from '../../../ui/Icons'
import { GroupCaption } from './GroupCaption'
import { MiniDayTaskGroups } from './MiniDayTaskGroups'
import { TimelineTaskItem } from './TimelineTaskItem'

type TimelineListProps = {
  title: string
  // 주간은 날짜 → 미니데이 → 할 일, 월간은 주 → 날짜 → 할 일(미니데이 구분 없음)
  viewMode: 'weekly' | 'monthly'
  // 기간의 날마다 한 묶음(buildDailyGroups). 월간은 안에서 주로 다시 묶는다
  groups: TimelineGroupData[]
  miniDayLabels: Array<{ id: number; label: string }>
  onSelectTask?: (task: TaskItem) => void
  todayKey: string
  // 끝난 기간이면 기록 있는 날(월간은 주)을 모두 펼쳐 둔다. 진행 중이면 오늘(월간은 오늘이 든 주)만 펼친다
  isPastPeriod: boolean
}

// 펼치고 접는 머리 한 줄: 화살표 + 이름 + 오른쪽 "완료/전체".
// 화살표(버튼 안 20)는 목록 앞 열(32 칸) 가운데, 이름은 글자 열(+40)에 둔다. 안의 할 일 행과 날짜 이름도 같은 글자 열이다(Task 21)
function GroupToggle({ expanded, onToggle, label, count }: { expanded: boolean; onToggle: () => void; label: ReactNode; count: string }) {
  return (
    <button
      type="button"
      aria-expanded={expanded}
      onClick={onToggle}
      className="relative isolate flex min-h-11 w-full items-center gap-list text-left before:absolute before:-inset-x-2 before:inset-y-0 before:-z-10 before:rounded-control before:transition-colors hover:before:bg-hover"
    >
      <span aria-hidden className="flex w-8 shrink-0 justify-center">
        <ChevronRightIcon
          className={`h-5 w-5 text-text-secondary transition-transform ${expanded ? 'rotate-90' : ''}`}
        />
      </span>
      <span className="min-w-0 flex-1 text-sm font-semibold text-text-primary">{label}</span>
      <span className="shrink-0 text-xs text-text-secondary">{count}</span>
    </button>
  )
}

// 기록 없는 날(주) 한 줄. 화살표 자리(32)를 비워 이름을 펼치는 줄과 같은 글자 열에 둔다
function EmptyGroupRow({ label, range }: { label: string; range?: string }) {
  return (
    <div className="flex min-h-11 items-center gap-list border-t border-border-subtle first:border-t-0">
      <span aria-hidden className="w-8 shrink-0" />
      <p className="min-w-0 flex-1 text-sm text-text-secondary">
        {label}
        {range && <span className="ml-list text-xs">{range}</span>}
      </p>
      <p className="text-xs text-text-secondary">기록 없음</p>
    </div>
  )
}

// 주간, 월간 할 일 기록. 목록 한 장 안에 주간은 날마다, 월간은 주마다 한 묶음을 둔다(사용자 결정 2026-10-20: 월간 주 묶음).
// 아직 오지 않은 날(주)은 숨기고, 기록 없는 날(주)은 한 줄로 줄인다.
export function TimelineList({
  title,
  viewMode,
  groups,
  miniDayLabels,
  onSelectTask,
  todayKey,
  isPastPeriod,
}: TimelineListProps) {
  const pastOrToday = groups.filter((group) => group.dateKey <= todayKey)
  const hasRecords = pastOrToday.some((group) => group.taskCount > 0)
  const weeks = viewMode === 'monthly'
    ? buildMonthWeekGroups(groups).filter((week) => week.startKey <= todayKey)
    : []

  // 부모가 기간마다 key를 바꿔 다시 만들므로 처음 펼칠 묶음은 처음 렌더에서 한 번만 정한다
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => {
    if (viewMode === 'monthly') {
      return new Set(
        weeks
          .filter((week) => week.taskCount > 0 && (isPastPeriod || (week.startKey <= todayKey && todayKey <= week.endKey)))
          .map((week) => week.key),
      )
    }
    return new Set(
      groups
        .filter((group) => group.taskCount > 0 && (isPastPeriod || group.dateKey === todayKey))
        .map((group) => group.key),
    )
  })

  const toggleGroup = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const todayMark = <span className="ml-list text-xs font-medium text-text-secondary">오늘</span>
  // 묶음 안 할 일: 완료한 것을 먼저 둔다
  const tasksOf = (group: TimelineGroupData) => [...group.completedTasks, ...group.incompleteTasks]

  return (
    <section>
      <SectionHeader title={title} />
      {!hasRecords ? (
        <Card>
          <EmptyState message="이 기간에는 할 일 기록이 없어요" className="py-0" />
        </Card>
      ) : viewMode === 'monthly' ? (
        <Card>
          {weeks.map((week) => {
            if (week.taskCount === 0) return <EmptyGroupRow key={week.key} label={week.label} range={week.rangeLabel} />
            const isExpanded = expandedKeys.has(week.key)
            return (
              <div key={week.key} className="border-t border-border-subtle first:border-t-0">
                <GroupToggle
                  expanded={isExpanded}
                  onToggle={() => toggleGroup(week.key)}
                  label={
                    <>
                      {week.label}
                      <span className="ml-list text-xs font-normal text-text-secondary">{week.rangeLabel}</span>
                    </>
                  }
                  count={`${week.completedCount}/${week.taskCount} 완료`}
                />
                {isExpanded && (
                  // 주 안에서는 기록 있는 날짜만, 날짜 이름(caption) 아래에 할 일을 둔다. 날짜 이름도 미니데이 머리와 같은 선 머리(GroupCaption)다. 미니데이 구분은 없다.
                  // 안쪽을 들이지 않는다: 날짜 이름과 할 일 글자는 머리 이름과 같은 글자 열, 체크는 화살표와 같은 앞 열이다
                  <div className="space-y-list pb-list">
                    {week.days
                      .filter((day) => day.taskCount > 0 && day.dateKey <= todayKey)
                      .map((day) => (
                        <div key={day.key}>
                          <GroupCaption>
                            {day.label}
                            {day.dateKey === todayKey && <span className="ml-list">오늘</span>}
                          </GroupCaption>
                          <div>
                            {tasksOf(day).map((item) => (
                              <TimelineTaskItem key={item.id} item={item} onSelect={onSelectTask} />
                            ))}
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )
          })}
        </Card>
      ) : (
        <Card>
          {pastOrToday.map((group) => {
            if (group.taskCount === 0) return <EmptyGroupRow key={group.key} label={group.label} />
            const isExpanded = expandedKeys.has(group.key)
            return (
              <div key={group.key} className="border-t border-border-subtle first:border-t-0">
                <GroupToggle
                  expanded={isExpanded}
                  onToggle={() => toggleGroup(group.key)}
                  label={
                    <>
                      {group.label}
                      {group.dateKey === todayKey && todayMark}
                    </>
                  }
                  count={`${group.completedTasks.length}/${group.taskCount} 완료`}
                />
                {isExpanded && (
                  <div className="pb-list">
                    <MiniDayTaskGroups tasks={tasksOf(group)} miniDayLabels={miniDayLabels} onSelectTask={onSelectTask} />
                  </div>
                )}
              </div>
            )
          })}
        </Card>
      )}
    </section>
  )
}
