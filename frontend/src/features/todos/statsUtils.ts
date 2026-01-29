import { MIN_FLOW_MS } from '../../lib/constants'
import type { Todo } from '../../api/types'
import type { FlexiblePhase, SingleTimerState, TimerMode, TimerPhase, TimerStatus } from '../timer/timerTypes'

export type DateStats = {
  date: string
  tasks: number
  completed: number
  flows: number
  focusSeconds: number
}

export type ModeStats = {
  pomodoro: number
  stopwatch: number
  none: number
}

export type ActiveTimerInfo = {
  todoId: string
  todoTitle: string
  mode: TimerMode
  phase: TimerPhase | FlexiblePhase | null
  status: TimerStatus
  cycleCount: number
  remainingMs: number | null
  focusElapsedMs: number
  breakElapsedMs: number
}

export type SessionDetail = {
  flowNumber: number
  focusMs: number
  breakMs: number
  focusTime: string
  breakTime: string
}

export type TaskDetail = {
  id: string
  title: string
  date: string
  isDone: boolean
  note: string | null
  timerMode: 'pomodoro' | 'stopwatch' | null
  pomodoroDone: number
  focusSeconds: number
  focusTime: string
  createdAt: string
  updatedAt: string
  completionDuration: string | null
  hasNote: boolean
  sessionCount: number
  totalSessionFocusMs: number
  totalSessionBreakMs: number
  totalElapsedTime: string
  totalBreakTime: string
  sessionDetails: SessionDetail[]
}

export type StatsResult = {
  totalTasks: number
  completedTasks: number
  totalFlows: number
  totalFocusSeconds: number
  totalFocusTime: string
  dateStats: DateStats[]
  modeStats: ModeStats
  completionRate: number
  avgFocusTime: number
  avgFlowsPerTask: string
  maxFocusTime: number
  tasksWithNotes: number
  activeTimers: ActiveTimerInfo[]
  taskDetails: TaskDetail[]
}

export function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  if (hours > 0) {
    return `${hours}시간 ${minutes}분 ${secs}초`
  }
  if (minutes > 0) {
    return `${minutes}분 ${secs}초`
  }
  return `${secs}초`
}

export function formatMs(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  return formatTime(seconds)
}

export function formatDuration(start: string, end: string): string {
  const startDate = new Date(start)
  const endDate = new Date(end)
  const diffMs = endDate.getTime() - startDate.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
  const diffSeconds = Math.floor((diffMs % (1000 * 60)) / 1000)

  if (diffDays > 0) {
    return `${diffDays}일 ${diffHours}시간 ${diffMinutes}분`
  }
  if (diffHours > 0) {
    return `${diffHours}시간 ${diffMinutes}분 ${diffSeconds}초`
  }
  if (diffMinutes > 0) {
    return `${diffMinutes}분 ${diffSeconds}초`
  }
  return `${diffSeconds}초`
}

export function buildStats(
  todos: Todo[],
  timers: Record<string, SingleTimerState>,
): StatsResult {
  const totalTasks = todos.length
  const completedTasks = todos.filter((t) => t.isDone).length
  const totalFlows = todos.reduce((sum, t) => sum + t.pomodoroDone, 0)

  const totalFocusSeconds = todos.reduce((sum, todo) => {
    const timer = timers[todo.id]
    const sessionHistory = timer?.sessionHistory ?? []
    if (sessionHistory.length > 0) {
      const totalSessionFocusMs = sessionHistory.reduce((s, session) => s + session.focusMs, 0)
      return sum + Math.floor(totalSessionFocusMs / 1000)
    }
    return sum + todo.focusSeconds
  }, 0)

  const modeStats: ModeStats = {
    pomodoro: todos.filter((t) => {
      const timer = timers[t.id]
      if (timer && timer.status !== 'idle') {
        return timer.mode === 'pomodoro'
      }
      return t.timerMode === 'pomodoro'
    }).length,
    stopwatch: todos.filter((t) => {
      const timer = timers[t.id]
      if (timer && timer.status !== 'idle') {
        return timer.mode === 'stopwatch'
      }
      return t.timerMode === 'stopwatch'
    }).length,
    none: todos.filter((t) => {
      const timer = timers[t.id]
      if (timer && timer.status !== 'idle') {
        return false
      }
      return !t.timerMode
    }).length,
  }

  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
  const avgFocusTime = totalTasks > 0 ? Math.round(totalFocusSeconds / totalTasks) : 0
  const avgFlowsPerTask = totalTasks > 0 ? (totalFlows / totalTasks).toFixed(1) : '0'
  const maxFocusTime = todos.reduce((max, t) => Math.max(max, t.focusSeconds), 0)
  const tasksWithNotes = todos.filter((t) => t.note && t.note.trim().length > 0).length

  const dateMap = new Map<string, DateStats>()

  for (const todo of todos) {
    const existing = dateMap.get(todo.date) || {
      date: todo.date,
      tasks: 0,
      completed: 0,
      flows: 0,
      focusSeconds: 0,
    }
    const timer = timers[todo.id]
    const sessionHistory = timer?.sessionHistory ?? []
    const effectiveFocusSeconds = sessionHistory.length > 0
      ? Math.floor(sessionHistory.reduce((s, session) => s + session.focusMs, 0) / 1000)
      : todo.focusSeconds

    dateMap.set(todo.date, {
      date: todo.date,
      tasks: existing.tasks + 1,
      completed: existing.completed + (todo.isDone ? 1 : 0),
      flows: existing.flows + todo.pomodoroDone,
      focusSeconds: existing.focusSeconds + effectiveFocusSeconds,
    })
  }

  const dateStats = Array.from(dateMap.values()).sort((a, b) => b.date.localeCompare(a.date))

  const activeTimers = Object.entries(timers)
    .filter(([todoId, timer]) => {
      const todo = todos.find((t) => t.id === todoId)
      return todo && !todo.isDone && timer.status !== 'idle'
    })
    .map(([todoId, timer]) => {
      const todo = todos.find((t) => t.id === todoId)
      if (!todo) return null

      return {
        todoId,
        todoTitle: todo.title,
        mode: timer.mode,
        phase: timer.mode === 'pomodoro' ? timer.phase : timer.flexiblePhase,
        status: timer.status,
        cycleCount: timer.cycleCount,
        remainingMs: timer.remainingMs,
        focusElapsedMs: timer.focusElapsedMs,
        breakElapsedMs: timer.breakElapsedMs,
      }
    })
    .filter((item): item is ActiveTimerInfo => item !== null)

  const taskDetails = todos
    .map((todo) => {
      const timer = timers[todo.id]
      const sessionHistory = timer?.sessionHistory ?? []
      const completionDuration = todo.isDone && todo.createdAt && todo.updatedAt
        ? formatDuration(todo.createdAt, todo.updatedAt)
        : null

      const totalSessionFocusMs = sessionHistory.reduce((sum, s) => sum + s.focusMs, 0)
      const totalSessionBreakMs = sessionHistory.reduce((sum, s) => sum + s.breakMs, 0)
      const totalElapsedMs = totalSessionFocusMs + totalSessionBreakMs
      const totalElapsedTime = formatMs(totalElapsedMs)
      const totalBreakTime = formatMs(totalSessionBreakMs)

      const effectiveFocusSeconds = sessionHistory.length > 0
        ? Math.floor(totalSessionFocusMs / 1000)
        : todo.focusSeconds
      const focusTime = formatTime(effectiveFocusSeconds)

      const sessionDetails = sessionHistory
        .filter((session) => session.focusMs >= MIN_FLOW_MS)
        .map((session, index) => ({
          flowNumber: index + 1,
          focusMs: session.focusMs,
          breakMs: session.breakMs,
          focusTime: formatMs(session.focusMs),
          breakTime: formatMs(session.breakMs),
        }))

      const effectiveTimerMode = (timer && timer.status !== 'idle') ? timer.mode : todo.timerMode

      return {
        id: todo.id,
        title: todo.title,
        date: todo.date,
        isDone: todo.isDone,
        note: todo.note,
        timerMode: effectiveTimerMode,
        pomodoroDone: todo.pomodoroDone,
        focusSeconds: effectiveFocusSeconds,
        focusTime,
        createdAt: todo.createdAt,
        updatedAt: todo.updatedAt,
        completionDuration,
        hasNote: !!(todo.note && todo.note.trim().length > 0),
        sessionCount: sessionHistory.length,
        totalSessionFocusMs,
        totalSessionBreakMs,
        totalElapsedTime,
        totalBreakTime,
        sessionDetails,
      }
    })
    .sort((a, b) => b.date.localeCompare(a.date) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  return {
    totalTasks,
    completedTasks,
    totalFlows,
    totalFocusSeconds,
    totalFocusTime: formatTime(totalFocusSeconds),
    dateStats,
    modeStats,
    completionRate,
    avgFocusTime,
    avgFlowsPerTask,
    maxFocusTime,
    tasksWithNotes,
    activeTimers,
    taskDetails,
  }
}
