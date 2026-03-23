export type PeriodType = 'daily' | 'weekly' | 'monthly'

export type DistributionBucket = {
  label: string
  seconds: number
  isPeak?: boolean
  bucketId?: number
  startKey?: string
  endKey?: string
}

export type TaskItem = {
  id: string
  title: string
  reviewRound?: number | null
  date: string
  isDone: boolean
  focusSeconds: number
  focusTime: string
  flowCount: number
  miniDay?: number
}

export type MiniDayGroup = {
  id: number
  label: string
  completed: TaskItem[]
  incomplete: TaskItem[]
}

export type HighlightTask = TaskItem

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
  range: PeriodRange
  totalFocusSeconds: number
  totalFlows: number
  completedCount: number
  highlight: HighlightTask | null
  completedTodos: TaskItem[]
  incompleteTodos: TaskItem[]
  distribution: DistributionBucket[]
  comparison?: PeriodComparison
}
