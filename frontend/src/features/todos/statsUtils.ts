import { MIN_FLOW_MS } from '../../lib/constants'
import type { Todo } from '../../api/types'
import type { FlexiblePhase, SingleTimerState, TimerMode, TimerPhase, TimerStatus } from '../timer/timerTypes'

export type DateStats = {
  date: string
  tasks: number
  completed: number
  flows: number
  sessionFocusSeconds: number
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
  sessionCount: number
  sessionFocusSeconds: number
  focusTime: string
  createdAt: string
  updatedAt: string
  completionDuration: string | null
  hasNote: boolean
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
  const totalFlows = todos.reduce((sum, t) => sum + t.sessionCount, 0)

  const totalFocusSeconds = todos.reduce((sum, todo) => {
    const timer = timers[todo.id]
    const sessions = timer?.sessions ?? []
    if (sessions.length > 0) {
      const totalSessionFocusSeconds = sessions.reduce(
        (s, session) => s + session.sessionFocusSeconds,
        0,
      )
      return sum + totalSessionFocusSeconds
    }
    return sum + todo.sessionFocusSeconds
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
  const maxFocusTime = todos.reduce((max, todo) => {
    const timer = timers[todo.id]
    const sessions = timer?.sessions ?? []
    const effectiveFocusSeconds = sessions.length > 0
      ? sessions.reduce((s, session) => s + session.sessionFocusSeconds, 0)
      : todo.sessionFocusSeconds
    return Math.max(max, effectiveFocusSeconds)
  }, 0)
  const tasksWithNotes = todos.filter((t) => t.note && t.note.trim().length > 0).length

  const dateMap = new Map<string, DateStats>()

  for (const todo of todos) {
    const existing = dateMap.get(todo.date) || {
      date: todo.date,
      tasks: 0,
      completed: 0,
      flows: 0,
      sessionFocusSeconds: 0,
    }
    const timer = timers[todo.id]
    const sessions = timer?.sessions ?? []
    const effectiveFocusSeconds = sessions.length > 0
      ? sessions.reduce((s, session) => s + session.sessionFocusSeconds, 0)
      : todo.sessionFocusSeconds

    dateMap.set(todo.date, {
      date: todo.date,
      tasks: existing.tasks + 1,
      completed: existing.completed + (todo.isDone ? 1 : 0),
      flows: existing.flows + todo.sessionCount,
      sessionFocusSeconds: existing.sessionFocusSeconds + effectiveFocusSeconds,
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
      const sessions = timer?.sessions ?? []
      const completionDuration = todo.isDone && todo.createdAt && todo.updatedAt
        ? formatDuration(todo.createdAt, todo.updatedAt)
        : null

      const totalSessionFocusSeconds = sessions.reduce(
        (sum, s) => sum + s.sessionFocusSeconds,
        0,
      )
      const totalSessionBreakSeconds = sessions.reduce((sum, s) => sum + s.breakSeconds, 0)
      const totalSessionFocusMs = totalSessionFocusSeconds * 1000
      const totalSessionBreakMs = totalSessionBreakSeconds * 1000
      const totalElapsedMs = totalSessionFocusMs + totalSessionBreakMs
      const totalElapsedTime = formatMs(totalElapsedMs)
      const totalBreakTime = formatMs(totalSessionBreakMs)

      const effectiveFocusSeconds = sessions.length > 0
        ? totalSessionFocusSeconds
        : todo.sessionFocusSeconds
      const focusTime = formatTime(effectiveFocusSeconds)

      const sessionDetails = sessions
        .filter((session) => session.sessionFocusSeconds * 1000 >= MIN_FLOW_MS)
        .map((session, index) => {
          const focusMs = session.sessionFocusSeconds * 1000
          const breakMs = session.breakSeconds * 1000
          return {
            flowNumber: index + 1,
            focusMs,
            breakMs,
            focusTime: formatMs(focusMs),
            breakTime: formatMs(breakMs),
          }
        })

      const effectiveTimerMode = (timer && timer.status !== 'idle') ? timer.mode : todo.timerMode

      return {
        id: todo.id,
        title: todo.title,
        date: todo.date,
        isDone: todo.isDone,
        note: todo.note,
        timerMode: effectiveTimerMode,
        sessionCount: sessions.length || todo.sessionCount,
        sessionFocusSeconds: effectiveFocusSeconds,
        focusTime,
        createdAt: todo.createdAt,
        updatedAt: todo.updatedAt,
        completionDuration,
        hasNote: !!(todo.note && todo.note.trim().length > 0),
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
