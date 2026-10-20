import { Fragment, useEffect, useMemo, useRef, useState, useCallback, type Dispatch, type SetStateAction } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { DndContext } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Calendar, type ViewMode } from '../../ui/Calendar'
import { PageHeader } from '../../ui/PageHeader'
import { formatDateKey, formatDateWithWeekday, formatStoppedTime, formatTimeRange } from '../../lib/time'
import { storageKeys } from '../../lib/storageKeys'
import { useNow } from '../../lib/useNow'
import { CheckIcon, PlusIcon, ChevronRightIcon, PlayIcon } from '../../ui/Icons'
import { IconButton } from '../../ui/IconButton'
import { Card } from '../../ui/Card'
import { InlineStatus } from '../../ui/InlineStatus'
import { SortableTodoItem } from './components/SortableTodoItem'
import { BatchActionBar } from './components/BatchActionBar'
import { TodoDatePickerSheet } from './components/TodoDatePickerSheet'
import { NoteModal } from './components/NoteModal'
import { TodoInputForm } from './components/TodoInputForm'
import { TodoMenuSheet } from './components/TodoMenuSheet'
import { ActiveSectionDrop, CrossSectionPreviewSlot, SectionGuideCard } from './components/TodoSectionParts'
import { TimerFullScreen } from '../timer/TimerFullScreen'
import { SessionDetailSheet } from '../review/components/SessionDetailSheet'
import { useSessionDetail } from './useSessionDetail'
import { useTodoActions } from './useTodoActions'
import { useStartFocus } from './useStartFocus'
import { useBatchSelect } from './useBatchSelect'
import { useReorderTodos, useTodos } from './hooks'
import { useDragAndDrop, getContainerId } from './useDragAndDrop'
import { defaultMiniDaysSettings, getDefaultMiniDayForDate } from '../../lib/miniDays'
import { useMiniDaysSettings } from '../settings/hooks'
import type { TodoDateActionKind } from './todoDateActionHelpers'
import { useCoachMark } from '../../lib/useCoachMark'
import { CoachMark } from '../../ui/CoachMark'
import { TodosSkeleton } from '../../ui/Skeleton'
import type { Todo, TodoList } from '../../api/types'
import { queryKeys } from '../../lib/queryKeys'
import { useAuthStore } from '../../store/authStore'
import { dragMessages, systemMessages } from '../../lib/messages'
import { isWaitingOffline } from '../../lib/queryStatus'
import {
  buildGroupedTodos,
  buildInitialOpenSections,
  findNextIncompleteTodo,
  formatSectionMeta,
  getGuideDisplayName,
  getNextDayOrder,
  getSectionGuideContent,
  parseDateParam,
  sectionHasTodos,
  readStoredTodosCalendarViewMode,
  TODOS_CALENDAR_VIEW_MODES,
  type DaySectionMeta,
  type TodosCalendarViewMode,
} from './todosPageHelpers'
import { useTimerStore } from '../timer/timerStore'
import { showsStartButton } from './timerStartRules'

// 다음 할 일 강조를 유지하는 시간
const HIGHLIGHT_MS = 1500
// 구간 제목 글자: title 16/600 text-primary. 지금 구간도 같은 색이다(사용자 결정 2026-10-20: 초록은 집중 시간에만 쓴다)
const SECTION_TITLE_CLASS = 'break-keep text-base font-semibold text-text-primary'
// 코치마크를 띄우는 그날 할 일 수 상한. 375×667에서 펼친 구간에 2개 + 한 줄 행 3개면 목록 아래 코치마크가 첫 화면 안이다
const COACH_MAX_TODOS = 2

function TodosPage() {
  const todosQuery = useTodos()
  const { data, isLoading, isError, isFetching, refetch } = todosQuery
  // 백그라운드 재조회 실패(data 있음)는 목록을 그대로 두고, 처음부터 못 불러왔을 때만 안내한다.
  // 오프라인으로 열어 아직 못 불러왔으면(paused) 빈 구간 대신 오프라인 안내를 둔다. 연결되면 저절로 불러온다
  const showOffline = isWaitingOffline(todosQuery)
  const showLoadError = (isError && !data) || showOffline
  const queryClient = useQueryClient()
  const reorderTodos = useReorderTodos()
  const [searchParams, setSearchParams] = useSearchParams()
  const dateParam = searchParams.get('date')

  const now = useNow()
  const guideDisplayName = getGuideDisplayName(useAuthStore((s) => s.state))
  const todayDateKey = formatDateKey(now)
  const todayDate = useMemo(() => parseDateParam(todayDateKey) ?? new Date(), [todayDateKey])
  // 주소의 날짜만 기준으로 삼는다. 날짜가 없으면(오늘을 골랐거나 탭으로 들어오면) 오늘이고,
  // 앱을 켜 둔 채 날짜가 바뀌어도 새 오늘을 따라간다.
  const selectedDate = useMemo(() => parseDateParam(dateParam) ?? todayDate, [dateParam, todayDate])
  // 월/주 보기는 사용자가 월/주 전환으로만 바꾸고, 고른 보기는 다시 열어도 기억한다
  const [calendarViewMode, setCalendarViewMode] = useState<TodosCalendarViewMode>(() =>
    readStoredTodosCalendarViewMode(),
  )
  const selectedDateKey = formatDateKey(selectedDate)
  const isSelectedDateToday = selectedDateKey === todayDateKey
  const { data: miniDaysSettings = defaultMiniDaysSettings } = useMiniDaysSettings()

  const handleCalendarViewModeChange = useCallback((nextMode: ViewMode) => {
    if (!TODOS_CALENDAR_VIEW_MODES.includes(nextMode as TodosCalendarViewMode)) return
    const next = nextMode as TodosCalendarViewMode
    setCalendarViewMode(next)
    try {
      window.localStorage.setItem(storageKeys.todosCalendarViewMode, next)
    } catch {
      // localStorage 접근 실패는 무시한다.
    }
  }, [])

  // 오늘을 고르면 주소에 날짜를 남기지 않아, 다시 열었을 때 지난 날짜에 머무르지 않게 한다.
  // 월 보기의 이전/다음 달도 이 함수로 날짜를 옮긴다(보기는 그대로).
  const handleSelectedDateChange = useCallback((nextDate: Date) => {
    const nextDateKey = formatDateKey(nextDate)
    const isToday = nextDateKey === formatDateKey(new Date())
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (isToday) next.delete('date')
      else next.set('date', nextDateKey)
      return next
    }, { replace: true, preventScrollReset: true })
  }, [setSearchParams])

  const daySections = useMemo(() => {
    return [
      { id: 0, title: '미분류', range: '언제든' },
      {
        id: 1,
        title: miniDaysSettings.day1.label,
        range: formatTimeRange(miniDaysSettings.day1.start, miniDaysSettings.day1.end),
      },
      {
        id: 2,
        title: miniDaysSettings.day2.label,
        range: formatTimeRange(miniDaysSettings.day2.start, miniDaysSettings.day2.end),
      },
      {
        id: 3,
        title: miniDaysSettings.day3.label,
        range: formatTimeRange(miniDaysSettings.day3.start, miniDaysSettings.day3.end),
      },
    ] satisfies DaySectionMeta[]
  }, [miniDaysSettings])

  const actions = useTodoActions(selectedDateKey)
  // 집중 기록(세션 상세). 회고 화면과 같은 시트를 메뉴의 "집중 기록"과 완료한 할 일의 시간 줄에서 연다(사용자 결정 2026-10-20)
  const sessionDetail = useSessionDetail()
  const batch = useBatchSelect()
  // 날짜가 바뀌면(직접 고르거나 자정에 새 오늘로 넘어가면) 보이지 않는 할 일이 선택된 채 남지 않도록 선택 모드를 끝낸다.
  const [selectModeDateKey, setSelectModeDateKey] = useState(selectedDateKey)
  if (selectModeDateKey !== selectedDateKey) {
    setSelectModeDateKey(selectedDateKey)
    if (batch.selectMode) batch.exitSelectMode()
  }
  const todosCoach = useCoachMark('todos-intro')
  const [inputDay, setInputDay] = useState<number | null>(null)
  // 섹션 + 를 누를 때마다 올려서, 이미 열려 있는 입력 줄에도 포커스를 옮긴다
  const [inputFocusSignal, setInputFocusSignal] = useState(0)

  const todosForSelectedDate = useMemo(() => {
    return (data?.items ?? []).filter((t) => t.date === selectedDateKey)
  }, [data?.items, selectedDateKey])

  const defaultOpenId = useMemo(
    () => getDefaultMiniDayForDate(selectedDate, miniDaysSettings, now),
    [selectedDate, miniDaysSettings, now],
  )

  const markedDates = useMemo(() => {
    const marks: Record<string, { done: number; total: number }> = {}
    for (const todo of data?.items ?? []) {
      if (!marks[todo.date]) marks[todo.date] = { done: 0, total: 0 }
      marks[todo.date].total++
      if (todo.isDone) marks[todo.date].done++
    }
    return marks
  }, [data?.items])

  const groupedTodos = useMemo(
    () => buildGroupedTodos(todosForSelectedDate, daySections),
    [daySections, todosForSelectedDate],
  )
  // 열림 상태의 기준 시간대는 날짜가 바뀔 때만 다시 잡는다. 같은 날 시간대 경계를 넘으면
  // 보던 섹션은 그대로 두고 새 시간대 섹션만 연다. 지난 구간을 가르는 시각도 기준과 함께 잡아 두어 분마다 흔들리지 않게 한다.
  const [openBase, setOpenBase] = useState({ dateKey: selectedDateKey, defaultOpenId, nowMs: now.getTime() })
  const isOpenBaseCurrent = openBase.dateKey === selectedDateKey
  const baseDefaultOpenId = isOpenBaseCurrent ? openBase.defaultOpenId : defaultOpenId
  const baseNowMs = isOpenBaseCurrent ? openBase.nowMs : now.getTime()
  const initialOpenSections = useMemo(
    () =>
      buildInitialOpenSections({
        selectedDateKey,
        todayDateKey,
        defaultOpenId: baseDefaultOpenId,
        daySections,
        groupedTodos,
        miniDaysSettings,
        now: new Date(baseNowMs),
      }),
    [baseDefaultOpenId, baseNowMs, daySections, groupedTodos, miniDaysSettings, selectedDateKey, todayDateKey],
  )
  const [openSectionsByDate, setOpenSectionsByDate] = useState<Record<string, Record<number, boolean>>>({})
  if (openBase.dateKey !== selectedDateKey || openBase.defaultOpenId !== defaultOpenId) {
    if (openBase.dateKey === selectedDateKey && isSelectedDateToday && defaultOpenId !== 0) {
      setOpenSectionsByDate((prev) => ({
        ...prev,
        [selectedDateKey]: { ...(prev[selectedDateKey] ?? initialOpenSections), [defaultOpenId]: true },
      }))
    }
    setOpenBase({ dateKey: selectedDateKey, defaultOpenId, nowMs: now.getTime() })
  }
  const openSections = openSectionsByDate[selectedDateKey] ?? initialOpenSections
  const setOpenSections = useCallback<Dispatch<SetStateAction<Record<number, boolean>>>>((value) => {
    setOpenSectionsByDate((prev) => {
      const current = prev[selectedDateKey] ?? initialOpenSections
      const next = typeof value === 'function' ? value(current) : value
      if (next === current) return prev
      return { ...prev, [selectedDateKey]: next }
    })
  }, [initialOpenSections, selectedDateKey])

  const dnd = useDragAndDrop({
    daySections,
    groupedTodos,
    todosForSelectedDate,
    openSections,
    setOpenSections,
    reorderTodosMutate: reorderTodos.mutate,
  })

  const sectionsWithTodos = daySections.filter(
    (section) => sectionHasTodos(groupedTodos, section.id),
  )
  const isAllOpen =
    sectionsWithTodos.length > 0 && sectionsWithTodos.every((section) => openSections[section.id])

  const blockFocusStats = useMemo(() => {
    const totals: Record<number, number> = {}
    daySections.forEach((section) => { totals[section.id] = 0 })
    for (const todo of todosForSelectedDate) {
      const miniDay = todo.miniDay ?? 0
      totals[miniDay] = (totals[miniDay] ?? 0) + todo.sessionFocusSeconds
    }
    const totalAll = daySections.reduce((sum, section) => sum + (totals[section.id] ?? 0), 0)
    return { totals, totalAll }
  }, [daySections, todosForSelectedDate])

  // 실행 중인 다른 할 일 이름(타이머를 막는 이유에 쓴다). 다른 날의 할 일일 수도 있어 전체 목록에서 찾는다
  const getTodoTitle = useCallback(
    (todoId: string) => data?.items.find((todo) => todo.id === todoId)?.title,
    [data?.items],
  )
  const getTodo = useCallback((todoId: string) => data?.items.find((todo) => todo.id === todoId), [data?.items])
  const startFocus = useStartFocus({
    openTimer: actions.handleOpenTimer,
    showTimerError: actions.showTimerError,
    getTodoTitle,
    getTodo,
  })

  // 타이머에서 할 일을 끝내고 돌아오면 같은 구간의 다음 미완료 할 일로 스크롤하고 잠깐 강조한다
  const [highlightedTodoId, setHighlightedTodoId] = useState<string | null>(null)
  const highlightTimerRef = useRef<number | null>(null)
  const handleCloseTimer = () => {
    const openedTodo = actions.timerTodo
    actions.handleCloseTimer()
    if (!openedTodo || openedTodo.isDone) return
    // 완료는 낙관적 업데이트로 캐시에 먼저 반영되므로 닫히는 시점의 캐시로 판단한다
    const items = queryClient.getQueryData<TodoList>(queryKeys.todos())?.items ?? []
    if (!items.find((todo) => todo.id === openedTodo.id)?.isDone) return
    const next = findNextIncompleteTodo(items, openedTodo)
    if (!next) return
    setOpenSections((prev) => ({ ...prev, [next.miniDay ?? 0]: true }))
    setHighlightedTodoId(next.id)
    if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current)
    highlightTimerRef.current = window.setTimeout(() => setHighlightedTodoId(null), HIGHLIGHT_MS)
  }
  useEffect(() => {
    if (!highlightedTodoId) return
    // 강조한 행이 그려진 뒤(구간을 막 펼쳤어도) 화면 가운데로 옮긴다
    const row = document.querySelector(`[data-todo-id="${highlightedTodoId}"]`)
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    row?.scrollIntoView?.({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' })
  }, [highlightedTodoId])
  useEffect(() => () => {
    if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current)
  }, [])

  // Esc로 비운 채 닫은 입력 줄이면 포커스가 body로 떨어진다(다른 곳을 눌러 닫았으면 그대로 둔다). 그 구간의 추가 버튼(빈 구간이면 한 줄 행)으로 돌려준다
  const refocusSectionIdRef = useRef<number | null>(null)
  useEffect(() => {
    const sectionId = refocusSectionIdRef.current
    if (sectionId === null) return
    refocusSectionIdRef.current = null
    const active = document.activeElement
    if (active && active !== document.body && document.body.contains(active)) return
    document.querySelector<HTMLElement>(`[data-section-add="${sectionId}"]`)?.focus({ preventScroll: true })
  })

  const closeInputForSection = (sectionId: number, submitted: boolean, viaEscape = false) => {
    setInputDay(null)
    if (!submitted && viaEscape) refocusSectionIdRef.current = sectionId
    // 방금 추가한 할 일은 아직 목록에 없으니, 추가했다면 섹션을 접지 않는다.
    if (!submitted && !sectionHasTodos(groupedTodos, sectionId)) {
      setOpenSections((prev) => ({ ...prev, [sectionId]: false }))
    }
  }

  const handleTodoDateAction = (todo: Todo, kind: TodoDateActionKind) => {
    switch (kind) {
      case 'move_to_today':
        void actions.handleMoveTodoToToday(todo)
        return
      case 'move_to_tomorrow':
        void actions.handleMoveTodoToTomorrow(todo)
        return
      case 'move_to_date':
        actions.openMoveDatePicker(todo)
        return
      case 'duplicate_to_today':
        void actions.handleDuplicateTodoToToday(todo)
        return
      case 'duplicate_to_tomorrow':
        void actions.handleDuplicateTodoToTomorrow(todo)
        return
      case 'duplicate_to_date':
        actions.openDuplicateDatePicker(todo)
        return
    }
  }

  // 키보드로 옮길 때 스크린리더가 읽는 안내와 알림. 할 일 id 대신 제목, 구간 id 대신 구간 이름을 읽는다.
  // DndContext가 렌더마다 알림을 다시 등록하지 않게 목록이 바뀔 때만 새로 만든다
  const dragAccessibility = useMemo(() => {
    const dragTitleOf = (id: string | number) => {
      const key = String(id)
      if (key.startsWith('day-')) return daySections.find((section) => getContainerId(section.id) === key)?.title ?? ''
      return todosForSelectedDate.find((todo) => todo.id === key)?.title ?? ''
    }
    return {
      screenReaderInstructions: { draggable: dragMessages.instructions },
      announcements: {
        onDragStart: ({ active }: { active: { id: string | number } }) => dragMessages.pickedUp(dragTitleOf(active.id)),
        // 집은 직후 제자리 위에 있다는 알림이 "집었어요"를 덮지 않게, 제자리 위에서는 읽지 않는다
        onDragOver: ({ active, over }: { active: { id: string | number }; over: { id: string | number } | null }) => {
          if (!over) return dragMessages.outside
          return over.id === active.id ? undefined : dragMessages.movedOver(dragTitleOf(over.id))
        },
        onDragEnd: ({ active }: { active: { id: string | number } }) => dragMessages.dropped(dragTitleOf(active.id)),
        onDragCancel: ({ active }: { active: { id: string | number } }) => dragMessages.canceled(dragTitleOf(active.id)),
      },
    }
  }, [daySections, todosForSelectedDate])

  const renderTodoItem = (todo: Todo, nextDoneOrder: number, nextActiveOrder: number) => {
    return (
      <SortableTodoItem
        key={todo.id}
        id={todo.id}
        todoId={todo.id}
        title={todo.title}
        note={todo.note}
        sessionFocusSeconds={todo.sessionFocusSeconds}
        timerMode={todo.timerMode}
        isDone={todo.isDone}
        isEditing={actions.editingId === todo.id}
        editingTitle={actions.editingTitle}
        onEditingTitleChange={actions.setEditingTitle}
        onToggle={() =>
          actions.handleToggleDone(
            todo.id,
            todo.title,
            !todo.isDone,
            !todo.isDone ? nextDoneOrder : nextActiveOrder,
            todo.dayOrder,
          )
        }
        onSaveEdit={actions.handleSaveEdit}
        onCancelEdit={actions.handleCancelEdit}
        onOpenMenu={() => actions.setSelectedTodo(todo)}
        onStartFocus={(anchor) => startFocus.handleStartFocus(todo, anchor)}
        // 제목 아래 시간 줄. 기록이 있거나 진행 중인 할 일은 오른쪽 ▶ 없이 이것으로 타이머에 간다.
        // 진행 중(실행, 일시정지, 단계 대기)이면 그 타이머를 그대로 열고(일시정지는 화면에서 이어서 한다),
        // 아니면 마지막에 쓴 타이머를 시작하지 않은 채 연다. 쓴 타이머를 모르면(예전 기록) 일반/뽀모도로를 고를 수 있는 메뉴 시트를 연다(모드를 멋대로 저장하지 않는다)
        onOpenTimer={() => {
          const current = useTimerStore.getState().timers[todo.id]
          actions.handleOpenTimer(todo, current && current.status !== 'idle' ? current.mode : null)
        }}
        onOpenSessions={() => sessionDetail.open(todo)}
        isFocusMenuOpen={startFocus.menuTodoId === todo.id}
        selectMode={batch.selectMode}
        isSelected={batch.selectedIds.has(todo.id)}
        onSelect={() => batch.toggleSelect(todo.id)}
        isHighlighted={highlightedTodoId === todo.id}
        focusDisabled={!startFocus.isReady}
      />
    )
  }

  // 진행 중(실행, 일시정지, 단계 대기) 타이머가 있는 할 일. 그런 행에는 ▶가 없다. 글자로 받아 타이머가 흐르는 동안 다시 그리지 않는다
  const activeTimerTodoIdsKey = useTimerStore((s) =>
    Object.keys(s.timers).filter((id) => s.timers[id].status !== 'idle').sort().join(','),
  )
  const activeTimerTodoIds = new Set(activeTimerTodoIdsKey.split(','))
  const showListControls = !isLoading && !showLoadError && todosForSelectedDate.length > 0
  // 코치마크는 가리키는 ▶(집중 시작) 버튼이 화면에 있을 때만 띄운다(펼친 구간에 타이머를 쓰지 않은 미완료 할 일이 있고 선택 모드가 아닐 때)
  // 목록 아래에 두므로, 할 일이 적은 날(처음 할 일을 만든 직후처럼 COACH_MAX_TODOS개 이하)에만 띄워 첫 화면 안에 보이게 한다.
  // 할 일이 많은 날에는 아래로 밀려 보이지 않으므로 띄우지 않고(본 것으로 치지 않는다) 다음에 할 일이 적은 날을 기다린다
  const hasStartButtonOnScreen =
    showListControls &&
    todosForSelectedDate.length <= COACH_MAX_TODOS &&
    !batch.selectMode &&
    daySections.some((section) =>
      openSections[section.id] &&
      groupedTodos[section.id]?.some((todo) =>
        showsStartButton({ isDone: todo.isDone, focusSeconds: todo.sessionFocusSeconds, hasActiveTimer: activeTimerTodoIds.has(todo.id) }),
      ),
    )

  // 할 일(끌어 오는 중인 것 포함)도 입력 줄도 없는 구간. 제자리에 한 줄 행으로 줄인다
  const isSectionCompact = (sectionId: number) =>
    dnd.getTodosForContainer(getContainerId(sectionId)).length === 0 &&
    inputDay !== sectionId &&
    !(isSelectedDateToday && sectionId === defaultOpenId && !batch.selectMode)

  const openInputForSection = (sectionId: number) => {
    setOpenSections((prev) => ({ ...prev, [sectionId]: true }))
    setInputDay(sectionId)
    setInputFocusSignal((n) => n + 1)
  }

  const toggleAllSections = () => {
    if (isAllOpen) {
      setOpenSections({})
      setInputDay(null)
      return
    }
    const next: Record<number, boolean> = {}
    daySections.forEach((sectionItem) => {
      next[sectionItem.id] = sectionHasTodos(groupedTodos, sectionItem.id)
    })
    setOpenSections(next)
  }

  // 맨 위 제목은 회고, 설정과 같은 PageHeader("계획")이고 아래 간격도 같은 20px(space-y-section)이다.
  // 날짜와 그날 집중 합계, 선택, 모두 접기는 목록 카드 머리 줄이 맡는다(예전 모양, 사용자 결정 2026-10-20)
  return (
    <div className="space-y-section">
      <PageHeader title="계획" />

      <Calendar
        selectedDate={selectedDate}
        onSelectDate={handleSelectedDateChange}
        onMonthChange={handleSelectedDateChange}
        markedDates={markedDates}
        viewMode={calendarViewMode}
        onViewModeChange={handleCalendarViewModeChange}
      />

      {/* 불러오지 못했거나 오프라인이면 빈 카드 대신 상자 없는 한 줄로 알린다(InlineStatus, §3-2) */}
      {showOffline ? (
        <InlineStatus kind="waiting" message={systemMessages.offlineLoadFailed('할 일')} />
      ) : showLoadError ? (
        <InlineStatus
          message="할 일을 불러오지 못했어요"
          actionLabel="다시 시도"
          onAction={() => void refetch()}
          actionDisabled={isFetching}
        />
      ) : (
        // §7 Card p-card의 예외 하나: 이 목록 카드만 위아래 여백을 card-item(12)으로 둔다. 머리 줄은 pt-1을 더해 위가 16이고,
        // 첫 구간 머리와 마지막 행(44)은 제 높이 안에 여백을 갖고 있다
        <Card padding="none" className="px-card py-card-item">
          {/* 머리 줄: 왼쪽 날짜(굵게)와 집중 합계(바탕 없는 초록 글자), 오른쪽 회색 글자 버튼(선택, 모두 펼침/접기).
              글자 버튼은 보이는 높이 16이라 터치 영역(after)만 넓혀 44×44를 맞춘다. 선택은 왼쪽(알약 쪽, 누를 것이 아니다)으로,
              모두 펼침은 12px 사이의 절반씩 넓혀 서로 겹치지 않는다 */}
          <div className="mb-card-item flex items-center justify-between gap-list pt-1">
            <div className="flex min-w-0 items-center gap-list">
              <h2 className="whitespace-nowrap text-base font-semibold text-text-primary">
                <span aria-hidden>{selectedDate.getMonth() + 1}월 {selectedDate.getDate()}일</span>
                <span className="sr-only">{formatDateWithWeekday(selectedDate, todayDate)}</span>
              </h2>
              {blockFocusStats.totalAll > 0 && (
                <span className="truncate text-xs font-semibold text-accent-text">
                  총 집중 · {formatStoppedTime(blockFocusStats.totalAll)}
                </span>
              )}
            </div>
            {showListControls && (
              <div className="flex shrink-0 items-center gap-3">
                <button
                  type="button"
                  onClick={batch.selectMode ? batch.exitSelectMode : batch.enterSelectMode}
                  className={`relative flex items-center gap-1 text-xs font-medium transition-colors after:absolute after:-left-5 after:-right-1.5 after:-inset-y-3.5 ${
                    batch.selectMode
                      ? 'text-accent-text'
                      : 'text-text-tertiary hover:text-text-secondary'
                  }`}
                >
                  {batch.selectMode ? (
                    <>
                      <CheckIcon aria-hidden className="h-3 w-3" strokeWidth={2.5} />
                      <span>취소</span>
                    </>
                  ) : (
                    <span>선택</span>
                  )}
                </button>
                <button
                  type="button"
                  aria-expanded={isAllOpen}
                  onClick={toggleAllSections}
                  className="relative flex items-center gap-1 text-xs font-medium text-text-tertiary transition-colors hover:text-text-secondary after:absolute after:-left-1.5 after:-right-2 after:-inset-y-3.5"
                >
                  <span>{isAllOpen ? '모두 접기' : '모두 펼침'}</span>
                  <ChevronRightIcon
                    aria-hidden
                    className={`h-3 w-3 transition-transform ${isAllOpen ? '-rotate-90' : 'rotate-90'}`}
                  />
                </button>
              </div>
            )}
          </div>

          {isLoading && <TodosSkeleton />}

          {!isLoading && (
            <DndContext
              sensors={dnd.sensors}
              collisionDetection={dnd.collisionDetectionStrategy}
              onDragStart={dnd.handleDragStart}
              onDragOver={dnd.handleDragOver}
              onDragCancel={dnd.handleDragCancel}
              onDragEnd={dnd.handleDragEnd}
              accessibility={dragAccessibility}
            >
              <div>
                {daySections.map((section, index) => {
                  const containerId = getContainerId(section.id)
                  const sectionTodos = dnd.getTodosForContainer(containerId)
                  const isSectionOpen = openSections[section.id] ?? false
                  const activeTodos = sectionTodos.filter((todo) => !todo.isDone)
                  const doneTodos = sectionTodos.filter((todo) => todo.isDone)
                  const totalCount = activeTodos.length + doneTodos.length
                  const nextActiveOrder = getNextDayOrder(activeTodos)
                  const nextDoneOrder = getNextDayOrder(doneTodos)
                  const isCurrentTimeSection = isSelectedDateToday && section.id === defaultOpenId
                  // 오늘 비어 있는 지금 구간: 펼친 채로 두고 안내 카드(인사 + 추가 버튼)를 보인다. 버튼을 누르면 그 자리에 입력 줄이 열린다.
                  // 선택 모드에서는 숨긴다
                  const isEmptyCurrent = isCurrentTimeSection && totalCount === 0 && !batch.selectMode
                  const shouldShowInput = inputDay === section.id
                  const showGuide = isEmptyCurrent && !shouldShowInput
                  const sectionMeta = formatSectionMeta({
                    range: section.range,
                    remaining: activeTodos.length,
                    total: totalCount,
                    focusSeconds: blockFocusStats.totals[section.id] ?? 0,
                  })
                  const previewActiveInsertIndex = dnd.crossSectionPreview?.containerId === containerId
                    ? Math.max(0, Math.min(dnd.crossSectionPreview.activeInsertIndex, activeTodos.length))
                    : null
                  const sortableIds = [
                    ...activeTodos.map((todo) => todo.id),
                    ...doneTodos.map((todo) => todo.id),
                  ]
                  // 할 일도 입력 줄도 없는 구간은 제자리에 한 줄(44)로 줄인다: 이름 + 시간대, 누르면 입력 줄이 그 자리에 열린다.
                  // 4구간은 늘 시간 순서대로 제자리에 있고(§2-1), 끌어 놓을 자리(droppable)도 그대로다.
                  // 끌어 온 할 일이 들어오면(dnd 기준 목록) 바로 펼친 구간으로 바뀌어 끌던 행이 사라지지 않는다
                  const isCompact = isSectionCompact(section.id)
                  // 구간 사이는 선 하나(내용 폭 전체). 선에서 위아래 글자 잉크까지를 13~16으로 맞춘다(Task 21):
                  // 위는 마지막 행의 아래 여백(py-3 12, 접힌 머리는 pb 12), 아래는 pt-tight 4 + 펼친 머리 안 4 + 제목 줄 반 행간.
                  // 한 줄로 줄인 구간은 높이 44 안에서 글자가 가운데라(위아래 10 + 반 행간) 따로 더하지 않는다.
                  // 첫 구간이 펼친 구간이면 카드 위 여백이 마지막 행 아래와 같도록 pt-list를 더한다(한 줄 구간은 44 안에 여백이 있다)
                  // 빈 구간도 펼친 구간 머리와 같은 두 줄(제목, 시간대)이라 위 여백도 같게 둔다(사용자 결정 2026-10-20)
                  const separatorClass = index === 0 ? 'pt-list' : 'border-t border-border-subtle pt-tight'
                  const sectionTitleContent = (
                    <>
                      {/* 지금 구간은 보이는 표시(초록, 점) 없이 스크린리더에만 알린다 */}
                      <span className="min-w-0">{section.title}</span>
                      {isCurrentTimeSection && <span className="sr-only">현재 시간대</span>}
                    </>
                  )

                  if (isCompact) {
                    const rangeId = `section-range-${section.id}`
                    const rowContent = (
                      <>
                        {/* 펼친 구간의 화살표 자리(32)를 비워 제목 열을 맞춘다. 시간대(미분류는 "언제든")는 펼친 구간처럼
                            제목 아래 둘째 줄에 같은 크기로 둔다(사용자 결정 2026-10-20) */}
                        <span aria-hidden className="w-8 shrink-0" />
                        <span className="flex min-w-0 flex-1 flex-col pt-tight">
                          <span className="flex items-center gap-list">{sectionTitleContent}</span>
                          <span id={rangeId} className="break-keep text-xs font-normal text-text-secondary">{section.range}</span>
                        </span>
                      </>
                    )
                    return (
                      <div key={section.id} className={separatorClass}>
                        <ActiveSectionDrop id={containerId}>
                          {(isOver) => (
                            <h3 className={SECTION_TITLE_CLASS}>
                              {batch.selectMode ? (
                                <span className="flex min-h-11 items-start gap-list pb-card-item">{rowContent}</span>
                              ) : (
                                <button
                                  type="button"
                                  data-section-add={section.id}
                                  aria-label={`${section.title} 할 일 추가`}
                                  aria-describedby={rangeId}
                                  onClick={() => openInputForSection(section.id)}
                                  className={`flex min-h-11 w-full items-start gap-list rounded-control pb-card-item text-left transition-colors hover:bg-hover ${
                                    isOver ? 'ring-2 ring-inset ring-accent' : ''
                                  }`}
                                >
                                  {rowContent}
                                  <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center text-text-secondary">
                                    <PlusIcon />
                                  </span>
                                </button>
                              )}
                            </h3>
                          )}
                        </ActiveSectionDrop>
                      </div>
                    )
                  }

                  return (
                    <div key={section.id} className={separatorClass}>
                      <ActiveSectionDrop id={containerId}>
                        {() => (
                          <>
                            {/* 구간 머리: 제목 한 줄 + "06:00–12:00 · 2개 남음 · 집중 1시간 15분" 한 줄. 배지는 쓰지 않는다.
                                지금 구간도 제목 색은 같고, "현재 시간대"는 스크린리더에만 읽힌다.
                                화살표와 + 버튼은 제목 줄(pt-1 + 24, 가운데 16)에 맞추고 둘째 줄은 그 아래에 둔다(할 일 행과 같은 첫 줄 정렬).
                                접혀 있으면 아래 여백 12를 더해 구분선까지 행과 같은 간격을 둔다 */}
                            <div className={`flex min-h-11 items-start gap-list ${isSectionOpen ? '' : 'pb-card-item'}`}>
                              <IconButton
                                label={`${section.title} 섹션 ${isSectionOpen ? '접기' : '펼치기'}`}
                                aria-expanded={isSectionOpen}
                                onClick={() =>
                                  setOpenSections((prev) => ({
                                    ...prev,
                                    [section.id]: !prev[section.id],
                                  }))
                                }
                              >
                                <ChevronRightIcon className={`transition-transform ${isSectionOpen ? 'rotate-90' : ''}`} />
                              </IconButton>
                              <div className="min-w-0 flex-1 pt-tight">
                                <h3 className={`flex items-center gap-list ${SECTION_TITLE_CLASS}`}>{sectionTitleContent}</h3>
                                {/* 집중 부분만 초록(accent-text)으로 칠한다(사용자 결정 2026-10-20) */}
                                <p className="break-keep text-xs text-text-secondary">
                                  {sectionMeta.base}
                                  {sectionMeta.focus && (
                                    <>
                                      {' · '}
                                      <span className="text-accent-text">{sectionMeta.focus}</span>
                                    </>
                                  )}
                                </p>
                              </div>
                              {/* 선택 모드에서는 숨긴다(입력 줄이 열리면 고르는 중인 목록과 섞인다) */}
                              {!batch.selectMode && (
                                <IconButton
                                  label={`${section.title} 할 일 추가`}
                                  data-section-add={section.id}
                                  onClick={() => {
                                    setOpenSections((prev) => ({ ...prev, [section.id]: true }))
                                    setInputDay((current) => (current === section.id ? null : section.id))
                                  }}
                                >
                                  <PlusIcon />
                                </IconButton>
                              )}
                            </div>
                            {isSectionOpen && (
                              <ul>
                                <SortableContext
                                  id={containerId}
                                  items={sortableIds}
                                  strategy={verticalListSortingStrategy}
                                >
                                  {previewActiveInsertIndex === 0 && activeTodos.length === 0 && (
                                    <CrossSectionPreviewSlot />
                                  )}
                                  {activeTodos.map((todo, activeIndex) => (
                                    <Fragment key={todo.id}>
                                      {previewActiveInsertIndex === activeIndex && <CrossSectionPreviewSlot />}
                                      {renderTodoItem(todo, nextDoneOrder, nextActiveOrder)}
                                    </Fragment>
                                  ))}
                                  {previewActiveInsertIndex === activeTodos.length && activeTodos.length > 0 && (
                                    <CrossSectionPreviewSlot />
                                  )}
                                  {/* 입력창은 한 자리에만 둔다. 첫 할 일이 생겨 위치가 바뀌면 다시 마운트되어 치던 글자를 잃는다 */}
                                  {shouldShowInput && (
                                    <li>
                                      <TodoInputForm
                                        sectionId={section.id}
                                        sectionTitle={section.title}
                                        nextActiveOrder={nextActiveOrder}
                                        onCreate={actions.handleCreate}
                                        autoFocus={inputDay === section.id}
                                        focusSignal={inputDay === section.id ? inputFocusSignal : 0}
                                        // 비어 있는 지금 구간은 입력을 닫아도 접지 않는다(안내 카드가 다시 보인다)
                                        onClose={(submitted, viaEscape) => closeInputForSection(section.id, submitted || isEmptyCurrent, viaEscape)}
                                      />
                                    </li>
                                  )}
                                  {showGuide && (
                                    <li>
                                      <SectionGuideCard
                                        {...getSectionGuideContent({
                                          sectionId: section.id,
                                          title: section.title,
                                          displayName: guideDisplayName,
                                        })}
                                        onAdd={() => openInputForSection(section.id)}
                                      />
                                    </li>
                                  )}
                                  {doneTodos.map((todo) =>
                                    renderTodoItem(todo, nextDoneOrder, nextActiveOrder)
                                  )}
                                </SortableContext>
                              </ul>
                            )}
                          </>
                        )}
                      </ActiveSectionDrop>
                    </div>
                  )
                })}
              </div>
            </DndContext>
          )}
        </Card>
      )}

      {/* 목록 아래에 둔다. 달력과 목록 사이에 끼면 첫 할 일과 막 쓰던 입력 줄이 밀린다 */}
      <CoachMark
        message={
          <>
            <PlayIcon aria-hidden className="inline-block h-4 w-4 align-text-bottom" />
            <span className="sr-only">집중 시작</span> 버튼으로 타이머를 골라 집중을 시작해요.
            <br />
            할 일을 길게 눌러 순서를 바꿀 수 있어요.
          </>
        }
        visible={todosCoach.visible && hasStartButtonOnScreen}
        onDismiss={todosCoach.dismiss}
      />

      <TodoMenuSheet
        selectedTodo={actions.selectedTodo}
        showNoteModal={actions.showNoteModal}
        todayDateKey={todayDateKey}
        onClose={() => actions.setSelectedTodo(null)}
        onEdit={actions.handleEdit}
        onDelete={actions.handleDelete}
        onOpenNote={actions.handleOpenNote}
        onOpenTimer={actions.handleOpenTimer}
        // 메뉴를 닫고 같은 할 일의 집중 기록을 연다(시트는 한 번에 하나)
        onOpenSessions={(todo) => {
          actions.setSelectedTodo(null)
          sessionDetail.open(todo, { fromMenu: true })
        }}
        onTodoDateAction={handleTodoDateAction}
        showTimerError={actions.showTimerError}
        getTodoTitle={getTodoTitle}
      />

      <TodoDatePickerSheet
        isOpen={actions.datePickerOpen}
        mode={actions.datePickerMode}
        todoTitle={actions.datePickerTodo?.title}
        currentDateKey={actions.datePickerTodo?.date ?? null}
        selectedDateKey={actions.datePickerSelectedDate}
        onSelectDateKey={actions.setDatePickerSelectedDate}
        onClose={actions.closeDatePicker}
        onConfirm={() => { void actions.confirmDatePicker() }}
      />

      <NoteModal
        isOpen={actions.showNoteModal}
        onClose={actions.handleCloseNote}
        onCancelEdit={actions.handleCancelNoteEdit}
        noteEditMode={actions.noteEditMode}
        noteTodo={actions.noteTodo}
        noteText={actions.noteText}
        isSaving={actions.isNoteSaving}
        onNoteTextChange={actions.setNoteText}
        onDeleteNote={actions.handleDeleteNote}
        onSaveNote={actions.handleSaveNote}
        onEditNote={actions.handleEditNote}
      />

      <SessionDetailSheet
        task={sessionDetail.task}
        isOpen={!!sessionDetail.task}
        onClose={sessionDetail.close}
      />

      <TimerFullScreen
        isOpen={!!actions.timerTodo}
        onClose={handleCloseTimer}
        todoId={actions.timerTodo?.id ?? ''}
        todoTitle={actions.timerTodo?.title ?? ''}
        sessionCount={actions.timerTodo?.sessionCount ?? 0}
        sessionFocusSeconds={actions.timerTodo?.sessionFocusSeconds ?? 0}
        initialMode={actions.timerMode ?? undefined}
        isDone={actions.timerTodo?.isDone ?? false}
      />

      {startFocus.sheets}

      {/* 일괄 동작 바는 떠 있으므로 끝까지 스크롤해도 마지막 행과 버튼을 덮지 않게 바 높이만큼 비워 둔다 */}
      {batch.selectMode && (
        <div aria-hidden="true" data-batch-bar-spacer style={{ height: 'var(--batch-bar-offset, 0px)' }} />
      )}

      {batch.selectMode && (
        <BatchActionBar
          selectedCount={batch.selectedCount}
          onComplete={batch.batchComplete}
          onDelete={batch.batchDelete}
        />
      )}
    </div>
  )
}

export default TodosPage
