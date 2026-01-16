import { useMemo } from 'react'
import { useTodos } from './hooks'
import { useTimerStore } from '../timer/timerStore'
import { MIN_FLOW_MS } from '../../lib/constants'

function formatTime(seconds: number): string {
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

function formatMs(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  return formatTime(seconds)
}

function formatDuration(start: string, end: string): string {
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

export function StatsPage() {
  const { data, isLoading } = useTodos()
  const timers = useTimerStore((s) => s.timers)

  const stats = useMemo(() => {
    if (!data?.items) {
      return {
        totalTasks: 0,
        completedTasks: 0,
        totalFlows: 0,
        totalFocusSeconds: 0,
        totalFocusTime: '0분',
        dateStats: [] as Array<{ date: string; tasks: number; completed: number; flows: number; focusSeconds: number }>,
        modeStats: { pomodoro: 0, stopwatch: 0, none: 0 },
        completionRate: 0,
        avgFocusTime: 0,
        avgFlowsPerTask: 0,
        maxFocusTime: 0,
        tasksWithNotes: 0,
        activeTimers: [] as any[],
        taskDetails: [] as any[],
      }
    }

    const todos = data.items
    const totalTasks = todos.length
    const completedTasks = todos.filter((t) => t.isDone).length
    const totalFlows = todos.reduce((sum, t) => sum + t.pomodoroDone, 0)
    
    // 집중 시간 계산: sessionHistory가 있으면 sessionHistory 기반, 없으면 DB 값 사용
    const totalFocusSeconds = todos.reduce((sum, todo) => {
      const timer = timers[todo.id]
      const sessionHistory = timer?.sessionHistory ?? []
      if (sessionHistory.length > 0) {
        // 일반 타이머 및 뽀모도로: sessionHistory 기반
        const totalSessionFocusMs = sessionHistory.reduce((s, session) => s + session.focusMs, 0)
        return sum + Math.floor(totalSessionFocusMs / 1000)
      } else {
        // sessionHistory 없는 경우: DB 값 사용
        return sum + todo.focusSeconds
      }
    }, 0)
    
    // 타이머 모드별 통계 (현재 실행 중인 타이머가 있으면 timer.mode 우선, 없으면 todo.timerMode 사용)
    const modeStats = {
      pomodoro: todos.filter((t) => {
        const timer = timers[t.id]
        // 실행 중인 타이머가 있으면 timer.mode 우선
        if (timer && timer.status !== 'idle') {
          return timer.mode === 'pomodoro'
        }
        // 없으면 todo.timerMode 사용
        return t.timerMode === 'pomodoro'
      }).length,
      stopwatch: todos.filter((t) => {
        const timer = timers[t.id]
        // 실행 중인 타이머가 있으면 timer.mode 우선
        if (timer && timer.status !== 'idle') {
          return timer.mode === 'stopwatch'
        }
        // 없으면 todo.timerMode 사용
        return t.timerMode === 'stopwatch'
      }).length,
      none: todos.filter((t) => {
        const timer = timers[t.id]
        // 실행 중인 타이머가 있으면 none이 아님
        if (timer && timer.status !== 'idle') {
          return false
        }
        // 없으면 todo.timerMode가 없으면 none
        return !t.timerMode
      }).length,
    }
    
    // 완료율
    const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
    
    // 평균 집중 시간 (초)
    const avgFocusTime = totalTasks > 0 ? Math.round(totalFocusSeconds / totalTasks) : 0
    
    // 평균 Flow 수
    const avgFlowsPerTask = totalTasks > 0 ? (totalFlows / totalTasks).toFixed(1) : '0'
    
    // 최장 집중 시간
    const maxFocusTime = todos.reduce((max, t) => Math.max(max, t.focusSeconds), 0)
    
    // 메모가 있는 태스크 수
    const tasksWithNotes = todos.filter((t) => t.note && t.note.trim().length > 0).length

    // 날짜별 통계
    const dateMap = new Map<string, { tasks: number; completed: number; flows: number; focusSeconds: number }>()
    
    for (const todo of todos) {
      const existing = dateMap.get(todo.date) || { tasks: 0, completed: 0, flows: 0, focusSeconds: 0 }
      const timer = timers[todo.id]
      const sessionHistory = timer?.sessionHistory ?? []
      
      // 집중 시간: sessionHistory가 있으면 sessionHistory 기반, 없으면 DB 값 사용
      // 일반 타이머 및 뽀모도로 모두 sessionHistory 사용
      const effectiveFocusSeconds = sessionHistory.length > 0
        ? Math.floor(sessionHistory.reduce((s, session) => s + session.focusMs, 0) / 1000)
        : todo.focusSeconds
      
      dateMap.set(todo.date, {
        tasks: existing.tasks + 1,
        completed: existing.completed + (todo.isDone ? 1 : 0),
        flows: existing.flows + todo.pomodoroDone,
        focusSeconds: existing.focusSeconds + effectiveFocusSeconds,
      })
    }

    const dateStats = Array.from(dateMap.entries())
      .map(([date, stats]) => ({ date, ...stats }))
      .sort((a, b) => b.date.localeCompare(a.date)) // 최신 날짜부터

    // 세션 상세 정보는 제거됨 (태스크별 상세 정보에 통합)

    // 진행 중인 타이머 정보 (완료된 태스크 제외)
    const activeTimers = Object.entries(timers)
      .filter(([todoId, timer]) => {
        const todo = todos.find((t) => t.id === todoId)
        // 완료된 태스크는 제외, idle 상태도 제외
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
      .filter((item): item is NonNullable<typeof item> => item !== null)

    // 태스크별 상세 정보
    const taskDetails = todos
      .map((todo) => {
        const timer = timers[todo.id]
        const sessionHistory = timer?.sessionHistory ?? []
        const completionDuration = todo.isDone && todo.createdAt && todo.updatedAt
          ? formatDuration(todo.createdAt, todo.updatedAt)
          : null

        // 전체 걸린 시간 계산: flow1 + break1 + flow2 + break2 + ...
        // sessionHistory의 각 세션은 { focusMs, breakMs } 형태
        const totalSessionFocusMs = sessionHistory.reduce((sum, s) => sum + s.focusMs, 0)
        const totalSessionBreakMs = sessionHistory.reduce((sum, s) => sum + s.breakMs, 0)
        const totalElapsedMs = totalSessionFocusMs + totalSessionBreakMs
        const totalElapsedTime = formatMs(totalElapsedMs)
        const totalBreakTime = formatMs(totalSessionBreakMs)

        // 집중 시간: sessionHistory가 있으면 sessionHistory 기반, 없으면 DB 값 사용
        // 일반 타이머 및 뽀모도로 모두 sessionHistory 사용
        const effectiveFocusSeconds = sessionHistory.length > 0 
          ? Math.floor(totalSessionFocusMs / 1000)
          : todo.focusSeconds
        const focusTime = formatTime(effectiveFocusSeconds)

        // 각 세션의 상세 정보 (Flow와 Break 시간)
        // Flow는 MIN_FLOW_MS 이상이면 인정되며, Break는 있으면 표시하고 없으면 표시하지 않음
        const sessionDetails = sessionHistory
          .filter((session) => session.focusMs >= MIN_FLOW_MS) // MIN_FLOW_MS 이상인 Flow만 표시
          .map((session, index) => ({
            flowNumber: index + 1,
            focusMs: session.focusMs,
            breakMs: session.breakMs,
            focusTime: formatMs(session.focusMs),
            breakTime: formatMs(session.breakMs),
          }))

        // 현재 실행 중인 타이머가 있으면 timer.mode 우선, 없으면 todo.timerMode 사용
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
          focusTime, // sessionHistory 기반 집중 시간
          createdAt: todo.createdAt,
          updatedAt: todo.updatedAt,
          completionDuration,
          hasNote: !!(todo.note && todo.note.trim().length > 0),
          sessionCount: sessionHistory.length,
          totalSessionFocusMs,
          totalSessionBreakMs,
          totalElapsedTime, // 전체 걸린 시간 (집중 + 휴식)
          totalBreakTime, // 전체 휴식 시간
          sessionDetails, // 각 세션의 상세 정보
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
  }, [data?.items, timers])

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">로딩 중...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">통계</h1>
      </header>

      {/* 전체 통계 */}
      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">전체 통계</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg bg-gray-50 p-4">
            <p className="text-sm text-gray-500">총 태스크</p>
            <p className="text-2xl font-bold text-gray-900">{stats.totalTasks}</p>
          </div>
          <div className="rounded-lg bg-gray-50 p-4">
            <p className="text-sm text-gray-500">완료된 태스크</p>
            <p className="text-2xl font-bold text-emerald-600">{stats.completedTasks}</p>
          </div>
          <div className="rounded-lg bg-gray-50 p-4">
            <p className="text-sm text-gray-500">완료율</p>
            <p className="text-2xl font-bold text-emerald-600">{stats.completionRate}%</p>
          </div>
          <div className="rounded-lg bg-gray-50 p-4">
            <p className="text-sm text-gray-500">총 Flow 세션</p>
            <p className="text-2xl font-bold text-blue-600">{stats.totalFlows}</p>
          </div>
          <div className="rounded-lg bg-gray-50 p-4">
            <p className="text-sm text-gray-500">총 집중 시간</p>
            <p className="text-2xl font-bold text-purple-600">{stats.totalFocusTime}</p>
          </div>
          <div className="rounded-lg bg-gray-50 p-4">
            <p className="text-sm text-gray-500">평균 집중 시간</p>
            <p className="text-2xl font-bold text-purple-600">{formatTime(stats.avgFocusTime)}</p>
          </div>
          <div className="rounded-lg bg-gray-50 p-4">
            <p className="text-sm text-gray-500">평균 Flow/태스크</p>
            <p className="text-2xl font-bold text-blue-600">{stats.avgFlowsPerTask}</p>
          </div>
          <div className="rounded-lg bg-gray-50 p-4">
            <p className="text-sm text-gray-500">최장 집중 시간</p>
            <p className="text-2xl font-bold text-purple-600">{formatTime(stats.maxFocusTime)}</p>
          </div>
        </div>
      </section>

      {/* 타이머 모드별 통계 */}
      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">타이머 모드별 통계</h2>
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-lg bg-red-50 p-4">
            <p className="text-sm text-gray-500">뽀모도로</p>
            <p className="text-2xl font-bold text-red-600">{stats.modeStats.pomodoro}</p>
          </div>
          <div className="rounded-lg bg-green-50 p-4">
            <p className="text-sm text-gray-500">일반 타이머</p>
            <p className="text-2xl font-bold text-green-600">{stats.modeStats.stopwatch}</p>
          </div>
          <div className="rounded-lg bg-gray-50 p-4">
            <p className="text-sm text-gray-500">미사용</p>
            <p className="text-2xl font-bold text-gray-600">{stats.modeStats.none}</p>
          </div>
        </div>
      </section>

      {/* 추가 통계 */}
      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">추가 통계</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg bg-gray-50 p-4">
            <p className="text-sm text-gray-500">메모가 있는 태스크</p>
            <p className="text-2xl font-bold text-gray-900">{stats.tasksWithNotes}</p>
          </div>
          <div className="rounded-lg bg-gray-50 p-4">
            <p className="text-sm text-gray-500">진행 중인 타이머</p>
            <p className="text-2xl font-bold text-orange-600">{stats.activeTimers.length}</p>
          </div>
        </div>
      </section>

      {/* 진행 중인 타이머 */}
      {stats.activeTimers.length > 0 && (
        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">진행 중인 타이머</h2>
          <div className="space-y-3">
            {stats.activeTimers.map((timer) => (
              <div key={timer.todoId} className="rounded-lg border border-gray-200 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">{timer.todoTitle}</p>
                    <div className="mt-1 flex gap-3 text-sm text-gray-500">
                      <span>모드: {timer.mode === 'pomodoro' ? '뽀모도로' : '일반'}</span>
                      <span>상태: {timer.status === 'running' ? '실행 중' : timer.status === 'paused' ? '일시정지' : '대기'}</span>
                      {timer.mode === 'pomodoro' && <span>사이클: {timer.cycleCount}</span>}
                      {timer.mode === 'stopwatch' && (
                        <>
                          <span>집중: {formatMs(timer.focusElapsedMs)}</span>
                          {timer.breakElapsedMs > 0 && <span>휴식: {formatMs(timer.breakElapsedMs)}</span>}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 날짜별 통계 */}
      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">날짜별 통계</h2>
        <div className="space-y-3">
          {stats.dateStats.length === 0 ? (
            <p className="text-center text-gray-500">데이터가 없습니다</p>
          ) : (
            stats.dateStats.map(({ date, tasks, completed, flows, focusSeconds }) => (
              <div key={date} className="flex items-center justify-between rounded-lg border border-gray-200 p-4">
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{date}</p>
                  <div className="mt-1 flex gap-4 text-sm text-gray-500">
                    <span>태스크: {tasks}</span>
                    <span>완료: {completed}</span>
                    <span>Flow: {flows}</span>
                    <span>집중: {formatTime(focusSeconds)}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* 태스크별 상세 정보 */}
      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">태스크별 상세 정보</h2>
        <div className="space-y-3">
          {stats.taskDetails.length === 0 ? (
            <p className="text-center text-gray-500">데이터가 없습니다</p>
          ) : (
            stats.taskDetails.map((task) => (
              <div key={task.id} className="rounded-lg border border-gray-200 p-4">
                <div className="mb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-gray-900">{task.title}</p>
                        {task.isDone && (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                            완료
                          </span>
                        )}
                        {task.hasNote && (
                          <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">
                            메모
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-gray-500">{task.date}</p>
                    </div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-gray-500">타이머 모드:</span>
                    <span className="ml-2 font-medium text-gray-700">
                      {task.timerMode === 'pomodoro' ? '뽀모도로' : task.timerMode === 'stopwatch' ? '일반' : '미사용'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">Flow 세션:</span>
                    <span className="ml-2 font-medium text-blue-600">{task.pomodoroDone}개</span>
                  </div>
                  <div>
                    <span className="text-gray-500">집중 시간:</span>
                    <span className="ml-2 font-medium text-purple-600">{task.focusTime}</span>
                  </div>
                  {task.totalBreakTime && task.totalBreakTime !== '0분' && (
                    <div>
                      <span className="text-gray-500">휴식 시간:</span>
                      <span className="ml-2 font-medium text-blue-600">{task.totalBreakTime}</span>
                    </div>
                  )}
                  {task.totalElapsedTime && task.totalElapsedTime !== '0분' && (
                    <div>
                      <span className="text-gray-500">전체 걸린 시간:</span>
                      <span className="ml-2 font-medium text-emerald-600">{task.totalElapsedTime}</span>
                    </div>
                  )}
                  {task.sessionCount > 0 && (
                    <div>
                      <span className="text-gray-500">세션 기록:</span>
                      <span className="ml-2 font-medium text-gray-700">{task.sessionCount}개</span>
                    </div>
                  )}
                  {/* 각 세션의 상세 정보 표시 */}
                  {task.sessionDetails && task.sessionDetails.length > 0 && (
                    <div className="col-span-2 mt-2 space-y-1 rounded bg-gray-50 p-2">
                      <p className="text-xs font-medium text-gray-600">세션 상세:</p>
                      {task.sessionDetails.map((session: { flowNumber: number; focusMs: number; breakMs: number; focusTime: string; breakTime: string }, idx: number) => (
                        <div key={idx} className="text-xs text-gray-600">
                          <span className="font-medium">Flow {session.flowNumber}:</span>
                          <span className="ml-1 text-purple-600">{session.focusTime}</span>
                          {session.breakMs > 0 && (
                            <>
                              <span className="mx-1">+</span>
                              <span className="font-medium">Break {session.flowNumber}:</span>
                              <span className="ml-1 text-blue-600">{session.breakTime}</span>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {task.note && (
                    <div className="col-span-2 mt-2 rounded bg-yellow-50 p-2">
                      <p className="text-xs text-gray-500">메모:</p>
                      <p className="text-sm text-gray-700">{task.note}</p>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  )
}
