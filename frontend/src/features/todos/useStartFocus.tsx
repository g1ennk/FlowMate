import { useCallback, useState } from 'react'
import type { Todo } from '../../api/types'
import { usePomodoroSettings } from '../settings/hooks'
import { DEFAULT_POMODORO_SETTINGS } from '../timer/timerDefaults'
import { useTimerStore } from '../timer/timerStore'
import type { TimerMode } from '../timer/timerTypes'
import { StartFocusMenu } from './components/StartFocusMenu'
import { getDisabledReason, getDisabledReasonMessage } from './timerStartRules'

type UseStartFocusParams = {
  // 타이머 전체 화면을 연다(모드를 할 일에 저장하는 일도 여기서 한다)
  openTimer: (todo: Todo, mode: TimerMode) => void
  showTimerError: (message: string) => void
  getTodoTitle: (todoId: string) => string | undefined
  // 목록(캐시)에 있는 지금의 할 일. 메뉴를 연 사이에 다른 기기에서 지우거나 끝냈는지 본다
  getTodo: (todoId: string) => Todo | undefined
}

/**
 * 할 일 행의 ▶ 버튼. 타이머를 한 번도 쓰지 않은 할 일에만 있으며, 버튼 옆에 일반 타이머와 뽀모도로를 고르는 작은 메뉴를 띄우고
 * 고른 모드의 타이머를 열어 곧바로 시작한다. 기록이 있거나 진행 중인 할 일은 시간 줄(onOpenTimer)로 타이머에 간다.
 * 시작 전에 getDisabledReason을 거친다. 다른 할 일 타이머가 돌고 있으면 메뉴 없이 이유를 토스트로 알린다.
 */
export function useStartFocus({ openTimer, showTimerError, getTodoTitle, getTodo }: UseStartFocusParams) {
  // 설정을 다 불러오기 전에는 시작하지 않는다(뽀모도로가 기본 25분으로 시작되는 것을 막는다). 불러오기에 실패하면 기본값으로 연다
  const { data: settings, isLoading: isSettingsLoading } = usePomodoroSettings()
  // 고르는 메뉴. 한 번에 하나만 연다(다른 행 버튼을 누르면 그 행 메뉴로 바뀐다)
  const [menu, setMenu] = useState<{ todo: Todo; anchor: HTMLElement } | null>(null)
  // 메뉴를 연 뒤 그 할 일이 목록에서 사라지거나(SSE, 다시 불러오기) 끝났으면 메뉴를 닫는다.
  // 버튼이 화면에서 떨어진 경우(다른 기기에서 타이머를 써 ▶가 사라진 경우 포함)는 StartFocusMenu가 그린 뒤에 보고 닫는다
  const menuTodo = menu ? getTodo(menu.todo.id) : undefined
  if (menu && (!menuTodo || menuTodo.isDone)) setMenu(null)

  // 끝냈거나 다른 할 일 타이머가 돌고 있으면 이유를 알리고 true를 돌려준다
  const reportBlocked = (todo: Todo, mode: TimerMode) => {
    const block = getDisabledReason(todo, mode, useTimerStore.getState().timers)
    if (block?.kind !== 'completed' && block?.kind !== 'otherRunning') return false
    showTimerError(getDisabledReasonMessage(block, getTodoTitle))
    return true
  }

  // mode로 시작한다. 메뉴를 연 사이에 다른 기기에서 이 할 일의 타이머를 썼으면 시작하지 않고 그 타이머를 연다
  const startWithMode = (todo: Todo, mode: TimerMode) => {
    if (reportBlocked(todo, mode)) return
    const store = useTimerStore.getState()
    const current = store.timers[todo.id]
    if (current && current.status !== 'idle') {
      openTimer(todo, current.mode)
      return
    }
    if (mode === 'pomodoro') {
      store.startPomodoro(todo.id, settings ?? DEFAULT_POMODORO_SETTINGS)
    } else {
      store.startStopwatch(todo.id, todo.sessionFocusSeconds * 1000, settings)
    }
    openTimer(todo, mode)
  }

  const handleStartFocus = (todo: Todo, anchor: HTMLElement) => {
    if (isSettingsLoading) return
    // 열린 메뉴의 버튼을 다시 누르면 닫는다
    if (menu?.todo.id === todo.id) {
      setMenu(null)
      return
    }
    // 막는 이유(끝냄, 다른 할 일 실행 중)는 모드와 상관없다
    if (reportBlocked(todo, todo.timerMode ?? 'pomodoro')) return
    setMenu({ todo, anchor })
  }

  const closeMenu = useCallback(() => setMenu(null), [])

  // 포커스를 버튼으로 먼저 돌려준 뒤 시작한다. 타이머 화면이 닫힐 때 그 버튼으로 돌아온다
  // 연 순간의 스냅샷이 아니라 지금 목록의 할 일로 시작한다(끝냈으면 startWithMode가 이유를 알린다)
  const chooseMode = (mode: TimerMode) => {
    if (!menu) return
    const latest = getTodo(menu.todo.id)
    if (menu.anchor.isConnected) menu.anchor.focus({ preventScroll: true })
    setMenu(null)
    if (latest) startWithMode(latest, mode)
  }

  const sheets = menu && menuTodo && !menuTodo.isDone ? (
    <StartFocusMenu
      key={menu.todo.id}
      todoTitle={menuTodo.title}
      anchor={menu.anchor}
      lastMode={menuTodo.timerMode ?? null}
      onChoose={chooseMode}
      onClose={closeMenu}
    />
  ) : null

  return { handleStartFocus, sheets, menuTodoId: menu?.todo.id ?? null, isReady: !isSettingsLoading }
}
