export type PeriodType = 'daily' | 'weekly' | 'monthly'

export type TaskItem = {
  id: string
  title: string
  date: string
  isDone: boolean
  focusSeconds: number
  focusTime: string
  flowCount: number
  miniDay?: number
}

export type PeriodComparison = {
  focusDelta: number
  flowDelta: number
  completedDelta: number
}

// 타임라인의 하루 묶음(주간, 월간 모두 날짜 단위)
export type TimelineGroupData = {
  key: string
  dateKey: string
  label: string
  taskCount: number
  completedTasks: TaskItem[]
  incompleteTasks: TaskItem[]
}

// 월간 타임라인의 주 묶음(월요일 시작, 그달 날짜만). 이름은 "10월 첫째 주"
export type TimelineWeekGroupData = {
  key: string
  label: string
  // 그달 안의 날짜 범위("1일–4일", 하루면 "1일")
  rangeLabel: string
  startKey: string
  endKey: string
  days: TimelineGroupData[]
  taskCount: number
  completedCount: number
}

export type PeriodRange = {
  start: Date
  end: Date
  startKey: string
  endKey: string
}

export type PeriodStats = {
  totalFocusSeconds: number
  totalFlows: number
  completedCount: number
  comparison: PeriodComparison
}
