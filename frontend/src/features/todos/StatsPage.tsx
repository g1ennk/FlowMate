import { useMemo } from 'react'
import type { Todo } from '../../api/types'
import { useTodos } from './hooks'
import { useTimerStore } from '../timer/timerStore'
import { buildStats, formatMs, formatTime } from './statsUtils'

const EMPTY_TODOS: Todo[] = []

export function StatsPage() {
  const { data, isLoading } = useTodos()
  const timers = useTimerStore((s) => s.timers)

  const items = data?.items ?? EMPTY_TODOS
  const stats = useMemo(() => buildStats(items, timers), [items, timers])

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
            <p className="text-sm text-gray-500">총 Flow 시간</p>
            <p className="text-2xl font-bold text-purple-600">{stats.totalFocusTime}</p>
          </div>
          <div className="rounded-lg bg-gray-50 p-4">
            <p className="text-sm text-gray-500">평균 Flow 시간</p>
            <p className="text-2xl font-bold text-purple-600">{formatTime(stats.avgFocusTime)}</p>
          </div>
          <div className="rounded-lg bg-gray-50 p-4">
            <p className="text-sm text-gray-500">평균 Flow/태스크</p>
            <p className="text-2xl font-bold text-blue-600">{stats.avgFlowsPerTask}</p>
          </div>
          <div className="rounded-lg bg-gray-50 p-4">
            <p className="text-sm text-gray-500">최장 Flow 시간</p>
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
                          <span>Flow: {formatMs(timer.focusElapsedMs)}</span>
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
                    <span>Flow: {formatTime(focusSeconds)}</span>
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
                    <span className="text-gray-500">Flow 시간:</span>
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
                              <span className="font-medium">휴식 {session.flowNumber}:</span>
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
