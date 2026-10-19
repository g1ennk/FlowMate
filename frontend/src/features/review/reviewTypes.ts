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

export type TimelineGroupData = {
  key: string
  label: string
  taskCount: number
  completedTasks: TaskItem[]
  incompleteTasks: TaskItem[]
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
