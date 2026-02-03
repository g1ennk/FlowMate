import type { MiniDaysSettings, Todo } from '../../api/types'
import type { SingleTimerState } from '../timer/timerTypes'
import { formatDateKey } from '../../ui/calendarUtils'
import type {
  DistributionBucket,
  PeriodComparison,
  PeriodRange,
  PeriodStats,
  PeriodType,
  TaskItem,
} from './reviewTypes'

const WEEKDAY_LABELS = ['월', '화', '수', '목', '금', '토', '일']

const toStartOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate())

const addDays = (date: Date, days: number) => {
  const next = new Date(date)
  next.setDate(date.getDate() + days)
  return next
}

const startOfWeek = (date: Date) => {
  const day = date.getDay()
  const diff = day === 0 ? -6 : 1 - day
  return toStartOfDay(addDays(date, diff))
}

const endOfWeek = (date: Date) => addDays(startOfWeek(date), 6)

const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1)
const endOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0)
const startOfYear = (date: Date) => new Date(date.getFullYear(), 0, 1)
const endOfYear = (date: Date) => new Date(date.getFullYear(), 11, 31)

export function parseDateKey(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return toStartOfDay(new Date())
  return new Date(year, month - 1, day)
}

export function formatFocusTime(seconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)

  if (hours > 0) {
    return `${hours}시간 ${minutes}분`
  }
  if (minutes > 0) {
    return `${minutes}분`
  }
  return '0분'
}

export function getPeriodRange(type: PeriodType, baseDate: Date): PeriodRange {
  let start: Date
  let end: Date

  if (type === 'daily') {
    start = toStartOfDay(baseDate)
    end = toStartOfDay(baseDate)
  } else if (type === 'weekly') {
    start = startOfWeek(baseDate)
    end = endOfWeek(baseDate)
  } else if (type === 'monthly') {
    start = startOfMonth(baseDate)
    end = endOfMonth(baseDate)
  } else {
    start = startOfYear(baseDate)
    end = endOfYear(baseDate)
  }

  return {
    start,
    end,
    startKey: formatDateKey(start),
    endKey: formatDateKey(end),
  }
}

export function getCalendarRange(mode: 'day' | 'week' | 'month' | 'year', baseDate: Date): PeriodRange {
  let start: Date
  let end: Date

  if (mode === 'day' || mode === 'week') {
    start = startOfWeek(baseDate)
    end = endOfWeek(baseDate)
  } else if (mode === 'month') {
    start = startOfMonth(baseDate)
    end = endOfMonth(baseDate)
  } else {
    start = startOfYear(baseDate)
    end = endOfYear(baseDate)
  }

  return {
    start,
    end,
    startKey: formatDateKey(start),
    endKey: formatDateKey(end),
  }
}

export function shiftBaseDate(type: PeriodType, baseDate: Date, delta: number) {
  if (type === 'daily') return addDays(baseDate, delta)
  if (type === 'weekly') return addDays(baseDate, delta * 7)
  if (type === 'monthly') return new Date(baseDate.getFullYear(), baseDate.getMonth() + delta, 1)
  return new Date(baseDate.getFullYear() + delta, 0, 1)
}

export function formatPeriodLabel(type: PeriodType, baseDate: Date) {
  if (type === 'daily') {
    return baseDate.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long',
    })
  }

  if (type === 'weekly') {
    const { start, end } = getPeriodRange(type, baseDate)
    const startLabel = start.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
    const endLabel = end.toLocaleDateString('ko-KR', {
      month: 'long',
      day: 'numeric',
    })
    return `${startLabel} ~ ${endLabel}`
  }

  if (type === 'monthly') {
    return baseDate.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
    })
  }

  return baseDate.toLocaleDateString('ko-KR', {
    year: 'numeric',
  })
}

const getEffectiveFocusSeconds = (
  todo: Todo,
  timers: Record<string, SingleTimerState>,
) => {
  const timer = timers[todo.id]
  const sessions = timer?.sessions ?? []
  if (sessions.length > 0) {
    return sessions.reduce((sum, session) => sum + session.sessionFocusSeconds, 0)
  }
  return todo.sessionFocusSeconds
}

const getEffectiveFlowCount = (
  todo: Todo,
  timers: Record<string, SingleTimerState>,
) => {
  const timer = timers[todo.id]
  const sessions = timer?.sessions ?? []
  if (sessions.length > 0) return sessions.length
  return todo.sessionCount
}

const isDateKeyInRange = (value: string, startKey: string, endKey: string) =>
  value >= startKey && value <= endKey

const buildTaskItem = (
  todo: Todo,
  focusSeconds: number,
  flowCount: number,
): TaskItem => ({
  id: todo.id,
  title: todo.title,
  date: todo.date,
  isDone: todo.isDone,
  focusSeconds,
  focusTime: formatFocusTime(focusSeconds),
  flowCount,
  miniDay: typeof todo.miniDay === 'number' ? todo.miniDay : 0,
})

const buildDistribution = (
  type: PeriodType,
  todos: Todo[],
  range: PeriodRange,
  miniDaysSettings: MiniDaysSettings,
  focusById: Map<string, number>,
): DistributionBucket[] => {
  if (type === 'daily') {
    const buckets = [
      { id: 0, label: '미분류' },
      { id: 1, label: miniDaysSettings.day1.label },
      { id: 2, label: miniDaysSettings.day2.label },
      { id: 3, label: miniDaysSettings.day3.label },
    ]

    return buckets.map((bucket) => {
      const seconds = todos.reduce((sum, todo) => {
        const miniDay = typeof todo.miniDay === 'number' ? todo.miniDay : 0
        if (miniDay !== bucket.id) return sum
        return sum + (focusById.get(todo.id) ?? 0)
      }, 0)

      return { label: bucket.label, seconds, bucketId: bucket.id }
    })
  }

  if (type === 'weekly') {
    const start = range.start
    return WEEKDAY_LABELS.map((label, index) => {
      const day = addDays(start, index)
      const dayKey = formatDateKey(day)
      const seconds = todos.reduce((sum, todo) => {
        if (todo.date !== dayKey) return sum
        return sum + (focusById.get(todo.id) ?? 0)
      }, 0)
      return { label, seconds, startKey: dayKey, endKey: dayKey }
    })
  }

  if (type === 'monthly') {
    const monthStart = range.start
    const monthEnd = range.end
    const weekBuckets: Array<{ label: string; startKey: string; endKey: string }> = []
    let cursor = startOfWeek(monthStart)
    let index = 1

    while (cursor <= monthEnd) {
      const weekStart = cursor
      const weekEnd = addDays(cursor, 6)
      weekBuckets.push({
        label: `${index}주`,
        startKey: formatDateKey(weekStart),
        endKey: formatDateKey(weekEnd),
      })
      cursor = addDays(cursor, 7)
      index += 1
    }

    return weekBuckets.map((bucket) => {
      const seconds = todos.reduce((sum, todo) => {
        if (!isDateKeyInRange(todo.date, bucket.startKey, bucket.endKey)) return sum
        return sum + (focusById.get(todo.id) ?? 0)
      }, 0)
      return { label: bucket.label, seconds, startKey: bucket.startKey, endKey: bucket.endKey }
    })
  }

  return Array.from({ length: 12 }, (_, index) => {
    const monthStart = new Date(range.start.getFullYear(), index, 1)
    const monthEnd = endOfMonth(monthStart)
    const startKey = formatDateKey(monthStart)
    const endKey = formatDateKey(monthEnd)
    const seconds = todos.reduce((sum, todo) => {
      if (!isDateKeyInRange(todo.date, startKey, endKey)) return sum
      return sum + (focusById.get(todo.id) ?? 0)
    }, 0)
    return { label: `${index + 1}월`, seconds, startKey, endKey }
  })
}

const withPeak = (items: DistributionBucket[]) => {
  const max = Math.max(0, ...items.map((item) => item.seconds))
  return items.map((item) => ({
    ...item,
    isPeak: max > 0 && item.seconds === max,
  }))
}

const buildTotals = (
  todos: Todo[],
  timers: Record<string, SingleTimerState>,
  range: PeriodRange,
) => {
  const periodTodos = todos.filter((todo) =>
    isDateKeyInRange(todo.date, range.startKey, range.endKey),
  )

  return periodTodos.reduce(
    (acc, todo) => {
      acc.totalFocusSeconds += getEffectiveFocusSeconds(todo, timers)
      acc.totalFlows += getEffectiveFlowCount(todo, timers)
      if (todo.isDone) acc.completedCount += 1
      return acc
    },
    { totalFocusSeconds: 0, totalFlows: 0, completedCount: 0 },
  )
}

const buildComparison = (
  todos: Todo[],
  timers: Record<string, SingleTimerState>,
  type: PeriodType,
  baseDate: Date,
): PeriodComparison => {
  const previousDate = shiftBaseDate(type, baseDate, -1)
  const previousRange = getPeriodRange(type, previousDate)
  const previousTotals = buildTotals(todos, timers, previousRange)
  const currentRange = getPeriodRange(type, baseDate)
  const currentTotals = buildTotals(todos, timers, currentRange)

  return {
    focusDelta: currentTotals.totalFocusSeconds - previousTotals.totalFocusSeconds,
    flowDelta: currentTotals.totalFlows - previousTotals.totalFlows,
    completedDelta: currentTotals.completedCount - previousTotals.completedCount,
  }
}

export function buildPeriodStats(
  todos: Todo[],
  timers: Record<string, SingleTimerState>,
  type: PeriodType,
  baseDate: Date,
  miniDaysSettings: MiniDaysSettings,
): PeriodStats {
  const range = getPeriodRange(type, baseDate)
  const periodTodos = todos.filter((todo) =>
    isDateKeyInRange(todo.date, range.startKey, range.endKey),
  )

  const focusById = new Map<string, number>()
  const flowById = new Map<string, number>()

  periodTodos.forEach((todo) => {
    const focusSeconds = getEffectiveFocusSeconds(todo, timers)
    const flowCount = getEffectiveFlowCount(todo, timers)
    focusById.set(todo.id, focusSeconds)
    flowById.set(todo.id, flowCount)
  })

  const taskItems = periodTodos.map((todo) =>
    buildTaskItem(todo, focusById.get(todo.id) ?? 0, flowById.get(todo.id) ?? 0),
  )

  const totalFocusSeconds = taskItems.reduce(
    (sum, item) => sum + item.focusSeconds,
    0,
  )
  const totalFlows = taskItems.reduce((sum, item) => sum + item.flowCount, 0)
  const completedCount = periodTodos.filter((todo) => todo.isDone).length

  const highlight = taskItems.reduce<TaskItem | null>((best, item) => {
    if (!best || item.focusSeconds > best.focusSeconds) return item
    return best
  }, null)

  const highlightTask =
    highlight && highlight.focusSeconds > 0 ? highlight : null

  const sortByFocus = (a: Todo, b: Todo) => {
    const focusA = focusById.get(a.id) ?? 0
    const focusB = focusById.get(b.id) ?? 0
    if (focusA !== focusB) return focusB - focusA
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  }

  const completedTodos = periodTodos
    .filter((todo) => todo.isDone)
    .sort(sortByFocus)
    .map((todo) =>
      buildTaskItem(todo, focusById.get(todo.id) ?? 0, flowById.get(todo.id) ?? 0),
    )

  const incompleteTodos = periodTodos
    .filter((todo) => !todo.isDone)
    .sort(sortByFocus)
    .map((todo) =>
      buildTaskItem(todo, focusById.get(todo.id) ?? 0, flowById.get(todo.id) ?? 0),
    )

  const distribution = withPeak(
    buildDistribution(type, periodTodos, range, miniDaysSettings, focusById),
  )

  const comparison = type === 'daily'
    ? undefined
    : buildComparison(todos, timers, type, baseDate)

  return {
    range,
    totalFocusSeconds,
    totalFlows,
    completedCount,
    highlight: highlightTask,
    completedTodos,
    incompleteTodos,
    distribution,
    comparison,
  }
}
