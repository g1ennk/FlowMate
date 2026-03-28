import { Fragment, useMemo, useRef, useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { DndContext } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useTimerStore, type SingleTimerState } from '../timer/timerStore'
import { Calendar, type ViewMode } from '../../ui/Calendar'
import { formatDateKey } from '../../lib/time'
import { PlusIcon, ChevronRightIcon } from '../../ui/Icons'
import { SortableTodoItem } from './components/SortableTodoItem'
import { TodoDatePickerSheet } from './components/TodoDatePickerSheet'
import { NoteModal } from './components/NoteModal'
import { TodoInputForm } from './components/TodoInputForm'
import { TodoMenuSheet } from './components/TodoMenuSheet'
import { ActiveSectionDrop, SectionGuideCard, CrossSectionPreviewSlot } from './components/TodoSectionParts'
import { TimerFullScreen } from '../timer/TimerFullScreen'
import { useTodoActions } from './useTodoActions'
import { useReorderTodos, useTodos } from './hooks'
import { useDragAndDrop, getContainerId } from './useDragAndDrop'
import { formatTimerHoursMinutes } from './todoTimerDisplay'
import { defaultMiniDaysSettings } from '../../lib/miniDays'
import { storageKeys } from '../../lib/storageKeys'
import { useMiniDaysSettings } from '../settings/hooks'
import { getDefaultMiniDayForDate } from './miniDayUtils'
import type { TodoDateActionKind } from './todoDateActionHelpers'
import { getTodoReviewBadgeLabel } from './reviewTodoDisplay'
import { useAuthStore } from '../../store/authStore'
import type { Todo } from '../../api/types'
import {
  buildGroupedTodos,
  buildInitialOpenSections,
  getGuideDisplayName,
  getNextDayOrder,
  getSectionGuideContent,
  parseDateParam,
  readStoredTodosCalendarViewMode,
  TODOS_CALENDAR_VIEW_MODES,
  type DaySectionMeta,
  type TodosCalendarViewMode,
} from './todosPageHelpers'

function TodosPage() {
  const { data, isLoading } = useTodos()
  const getTimer = useTimerStore((s) => s.getTimer)
  const reorderTodos = useReorderTodos()
  const authState = useAuthStore((s) => s.state)
  const [searchParams] = useSearchParams()
  const dateParam = searchParams.get('date')

  const [selectedDate, setSelectedDate] = useState(new Date())
  const [calendarViewMode, setCalendarViewMode] = useState<TodosCalendarViewMode>(() =>
    readStoredTodosCalendarViewMode(),
  )
  const selectedDateKey = formatDateKey(selectedDate)
  const todayDateKey = formatDateKey(new Date())
  const isSelectedDateToday = selectedDateKey === todayDateKey
  const { data: miniDaysSettings = defaultMiniDaysSettings } = useMiniDaysSettings()
  const guideDisplayName = getGuideDisplayName(authState)

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

  // URL의 date 파라미터가 변경되면 선택 날짜를 동기화
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    const nextDate = parseDateParam(dateParam)
    if (nextDate) setSelectedDate(nextDate)
  }, [dateParam])

  const daySections = useMemo(() => {
    const formatRange = (start: string, end: string) => {
      const trimmedStart = start.trim()
      const trimmedEnd = end.trim()
      if (!trimmedStart || !trimmedEnd) return ''
      return `${trimmedStart}–${trimmedEnd}`
    }

    return [
      { id: 0, title: '미분류', range: '' },
      {
        id: 1,
        title: miniDaysSettings.day1.label,
        range: formatRange(miniDaysSettings.day1.start, miniDaysSettings.day1.end),
      },
      {
        id: 2,
        title: miniDaysSettings.day2.label,
        range: formatRange(miniDaysSettings.day2.start, miniDaysSettings.day2.end),
      },
      {
        id: 3,
        title: miniDaysSettings.day3.label,
        range: formatRange(miniDaysSettings.day3.start, miniDaysSettings.day3.end),
      },
    ] satisfies DaySectionMeta[]
  }, [miniDaysSettings])

  const actions = useTodoActions(selectedDateKey)
  const [inputDay, setInputDay] = useState<number | null>(null)

  const todosForSelectedDate = useMemo(() => {
    return (data?.items ?? []).filter((t) => t.date === selectedDateKey)
  }, [data?.items, selectedDateKey])

  const defaultOpenId = useMemo(
    () => getDefaultMiniDayForDate(selectedDate, miniDaysSettings),
    [selectedDate, miniDaysSettings],
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
  const initialOpenSections = useMemo(
    () =>
      buildInitialOpenSections({
        selectedDateKey,
        todayDateKey,
        defaultOpenId,
        daySections,
        groupedTodos,
      }),
    [daySections, defaultOpenId, groupedTodos, selectedDateKey, todayDateKey],
  )
  const [openSections, setOpenSections] = useState<Record<number, boolean>>(() => initialOpenSections)
  const lastInitializedDateKeyRef = useRef<string | null>(null)

  // 날짜 변경 시 섹션 열림 상태를 초기화 — 외부 상태(URL) → 내부 상태 동기화
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    if (isLoading) return
    if (lastInitializedDateKeyRef.current === selectedDateKey) return
    lastInitializedDateKeyRef.current = selectedDateKey
    setOpenSections(initialOpenSections)
  }, [initialOpenSections, isLoading, selectedDateKey])

  const dnd = useDragAndDrop({
    daySections,
    groupedTodos,
    todosForSelectedDate,
    openSections,
    setOpenSections,
    reorderTodosMutate: reorderTodos.mutate,
  })

  const isAllOpen = daySections.every((section) => openSections[section.id])

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

  const getTodoTimer = (todoId: string): SingleTimerState | undefined => getTimer(todoId)

  const openQuickInputForSection = (sectionId: number) => {
    setOpenSections((prev) => ({ ...prev, [sectionId]: true }))
    setInputDay(sectionId)
  }

  const handleTodoDateAction = (todo: Todo, kind: TodoDateActionKind) => {
    switch (kind) {
      case 'schedule_review':
        void actions.handleScheduleReview(todo)
        return
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

  const renderTodoItem = (todo: Todo, nextDoneOrder: number, nextActiveOrder: number) => {
    const reviewBadgeLabel = getTodoReviewBadgeLabel(todo.reviewRound, todo.isDone)

    return (
      <SortableTodoItem
        key={todo.id}
        id={todo.id}
        todoId={todo.id}
        title={todo.title}
        reviewBadgeLabel={reviewBadgeLabel}
        note={todo.note}
        sessionCount={todo.sessionCount}
        sessionFocusSeconds={todo.sessionFocusSeconds}
        isDone={todo.isDone}
        isEditing={actions.editingId === todo.id}
        editingTitle={actions.editingTitle}
        onEditingTitleChange={actions.setEditingTitle}
        onToggle={() =>
          actions.handleToggleDone(
            todo.id,
            !todo.isDone,
            !todo.isDone ? nextDoneOrder : nextActiveOrder,
          )
        }
        onEdit={() => actions.handleEdit(todo.id, todo.title)}
        onSaveEdit={actions.handleSaveEdit}
        onCancelEdit={actions.handleCancelEdit}
        onDelete={() => actions.handleDelete(todo.id)}
        onOpenMenu={() => actions.setSelectedTodo(todo)}
        onOpenTimer={() => {
          const timer = getTodoTimer(todo.id)
          const modeToUse = timer?.mode || todo.timerMode || null
          actions.handleOpenTimer(todo, modeToUse)
        }}
        onOpenNote={() => actions.handleOpenNote(todo)}
      />
    )
  }

  return (
    <div className="space-y-4">
      <Calendar
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        onMonthChange={setSelectedDate}
        markedDates={markedDates}
        viewMode={calendarViewMode}
        onViewModeChange={handleCalendarViewModeChange}
      />

      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-gray-900">
              {selectedDate.getMonth() + 1}월 {selectedDate.getDate()}일
            </h2>
            {blockFocusStats.totalAll > 0 && (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                총 Flow · {formatTimerHoursMinutes(blockFocusStats.totalAll)}
              </span>
            )}
          </div>
          <button
            onClick={() => {
              if (isAllOpen) {
                setOpenSections({})
                setInputDay(null)
                return
              }
              const next: Record<number, boolean> = {}
              daySections.forEach((sectionItem) => { next[sectionItem.id] = true })
              setOpenSections(next)
            }}
            className="flex items-center gap-1 text-xs font-medium text-gray-400 hover:text-gray-600"
          >
            <span>{isAllOpen ? '모두 접기' : '모두 펼침'}</span>
            <ChevronRightIcon
              className={`h-3 w-3 transition-transform ${isAllOpen ? '-rotate-90' : 'rotate-90'}`}
            />
          </button>
        </div>

        {isLoading && <div className="py-8 text-center text-sm text-gray-400">불러오는 중...</div>}

        {!isLoading && (
          <DndContext
            sensors={dnd.sensors}
            collisionDetection={dnd.collisionDetectionStrategy}
            onDragStart={dnd.handleDragStart}
            onDragOver={dnd.handleDragOver}
            onDragCancel={dnd.handleDragCancel}
            onDragEnd={dnd.handleDragEnd}
          >
            <div className="space-y-6">
              {daySections.map((section, index) => {
                const containerId = getContainerId(section.id)
                const sectionTodos = dnd.getTodosForContainer(containerId)
                const isSectionOpen = openSections[section.id] ?? false
                const activeTodos = sectionTodos.filter((todo) => !todo.isDone)
                const doneTodos = sectionTodos.filter((todo) => todo.isDone)
                const totalCount = activeTodos.length + doneTodos.length
                const nextActiveOrder = getNextDayOrder(activeTodos)
                const nextDoneOrder = getNextDayOrder(doneTodos)
                const dayFocus = blockFocusStats.totals[section.id] ?? 0
                const isCurrentTimeSection = isSelectedDateToday && section.id === defaultOpenId
                const shouldShowInput = inputDay === section.id
                const isEmptySection = totalCount === 0
                const shouldShowPriorityGuide = isCurrentTimeSection || section.id === 0
                const inputAtTop = shouldShowInput && activeTodos.length === 0
                const inputBetween = shouldShowInput && activeTodos.length > 0
                const hasRangeMeta = section.range.trim().length > 0
                const hasFlowMeta = dayFocus > 0
                const showRangeOnMobile = hasRangeMeta && (!isSectionOpen || !hasFlowMeta)
                const showFlowOnMobile = hasFlowMeta && (isSectionOpen || !hasRangeMeta)
                const previewActiveInsertIndex = dnd.crossSectionPreview?.containerId === containerId
                  ? Math.max(0, Math.min(dnd.crossSectionPreview.activeInsertIndex, activeTodos.length))
                  : null
                const sortableIds = [
                  ...activeTodos.map((todo) => todo.id),
                  ...doneTodos.map((todo) => todo.id),
                ]

                return (
                  <section
                    key={section.id}
                    className={`${index === 0 ? '' : 'border-t border-gray-100 pt-5'} space-y-2`}
                  >
                    <ActiveSectionDrop id={containerId} className="space-y-2 pb-3">
                      {() => (
                        <>
                          <div className="grid grid-cols-[20px_minmax(0,1fr)_auto] items-start gap-2 rounded-xl px-2 py-1">
                            <button
                              onClick={() =>
                                setOpenSections((prev) => ({
                                  ...prev,
                                  [section.id]: !prev[section.id],
                                }))
                              }
                              aria-label={`${section.title} 섹션 ${isSectionOpen ? '접기' : '펼치기'}`}
                              aria-expanded={isSectionOpen}
                              className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100"
                            >
                              <ChevronRightIcon
                                className={`h-3 w-3 transition-transform ${isSectionOpen ? 'rotate-90' : ''}`}
                              />
                            </button>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-sm font-semibold text-gray-900">{section.title}</h3>
                                {totalCount > 0 && (
                                  <span className="text-xs text-gray-400">
                                    남음 {activeTodos.length} · 완료 {doneTodos.length}
                                  </span>
                                )}
                                {isCurrentTimeSection && (
                                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                    현재 시간대
                                  </span>
                                )}
                              </div>
                              {(hasRangeMeta || hasFlowMeta) && (
                                <div className="mt-0.5 flex min-h-[18px] flex-wrap items-center gap-2">
                                  {hasRangeMeta && (
                                    <span
                                      className={`text-xs text-gray-400 ${
                                        showRangeOnMobile ? 'inline-flex' : 'hidden sm:inline-flex'
                                      }`}
                                    >
                                      {section.range}
                                    </span>
                                  )}
                                  {hasFlowMeta && (
                                    <span
                                      className={`rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 ${
                                        showFlowOnMobile ? 'inline-flex' : 'hidden sm:inline-flex'
                                      }`}
                                    >
                                      Flow · {formatTimerHoursMinutes(dayFocus)}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                            <button
                              onClick={() => {
                                setOpenSections((prev) => ({ ...prev, [section.id]: true }))
                                setInputDay((current) => (current === section.id ? null : section.id))
                              }}
                              aria-label={`${section.title} 할 일 추가`}
                              className="mt-0.5 inline-flex h-8 w-8 items-center justify-center justify-self-end rounded-full text-emerald-700 transition-colors hover:bg-gray-100"
                            >
                              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white">
                                <PlusIcon className="h-2.5 w-2.5" />
                              </span>
                            </button>
                          </div>
                          {isSectionOpen && (
                            <div className="min-h-[44px] space-y-1 rounded-lg py-1">
                              {!shouldShowInput && isEmptySection && shouldShowPriorityGuide && (
                                <SectionGuideCard
                                  content={getSectionGuideContent({
                                    section,
                                    isSelectedDateToday,
                                    isCurrentTimeSection,
                                    displayName: guideDisplayName,
                                  })}
                                  onAdd={() => openQuickInputForSection(section.id)}
                                />
                              )}
                              <SortableContext
                                id={containerId}
                                items={sortableIds}
                                strategy={verticalListSortingStrategy}
                              >
                                {inputAtTop && (
                                  <TodoInputForm
                                    sectionId={section.id}
                                    nextActiveOrder={nextActiveOrder}
                                    onCreate={actions.handleCreate}
                                    onClose={() => setInputDay(null)}
                                  />
                                )}
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
                                {inputBetween && (
                                  <TodoInputForm
                                    sectionId={section.id}
                                    nextActiveOrder={nextActiveOrder}
                                    onCreate={actions.handleCreate}
                                    onClose={() => setInputDay(null)}
                                  />
                                )}
                                {doneTodos.map((todo) =>
                                  renderTodoItem(todo, nextDoneOrder, nextActiveOrder)
                                )}
                              </SortableContext>
                            </div>
                          )}
                        </>
                      )}
                    </ActiveSectionDrop>
                  </section>
                )
              })}
            </div>
          </DndContext>
        )}
      </div>

      <TodoMenuSheet
        selectedTodo={actions.selectedTodo}
        showNoteModal={actions.showNoteModal}
        todayDateKey={todayDateKey}
        onClose={() => {
          actions.setSelectedTodo(null)
          actions.setTimerErrorMessage(null)
        }}
        onEdit={actions.handleEdit}
        onDelete={actions.handleDelete}
        onOpenNote={actions.handleOpenNote}
        onOpenTimer={actions.handleOpenTimer}
        onTodoDateAction={handleTodoDateAction}
        setTimerErrorMessage={actions.setTimerErrorMessage}
      />

      <TodoDatePickerSheet
        isOpen={actions.datePickerOpen}
        mode={actions.datePickerMode}
        currentDateKey={actions.datePickerTodo?.date ?? null}
        selectedDateKey={actions.datePickerSelectedDate}
        onSelectDateKey={actions.setDatePickerSelectedDate}
        onClose={actions.closeDatePicker}
        onConfirm={() => { void actions.confirmDatePicker() }}
      />

      <NoteModal
        isOpen={actions.showNoteModal}
        onClose={actions.handleCloseNote}
        noteEditMode={actions.noteEditMode}
        noteTodo={actions.noteTodo}
        noteText={actions.noteText}
        onNoteTextChange={actions.setNoteText}
        onDeleteNote={actions.handleDeleteNote}
        onSaveNote={actions.handleSaveNote}
        onEditNote={actions.handleEditNote}
      />

      <TimerFullScreen
        isOpen={!!actions.timerTodo}
        onClose={actions.handleCloseTimer}
        todoId={actions.timerTodo?.id ?? ''}
        todoTitle={actions.timerTodo ? actions.timerTodo.title : ''}
        sessionCount={actions.timerTodo?.sessionCount ?? 0}
        sessionFocusSeconds={actions.timerTodo?.sessionFocusSeconds ?? 0}
        initialMode={actions.timerMode ?? undefined}
        isDone={actions.timerTodo?.isDone ?? false}
      />

      {actions.timerErrorMessage && (
        <div
          className="fixed left-0 right-0 z-[10000] flex justify-center px-6 pointer-events-none"
          style={{ bottom: 'calc(80px + var(--safe-bottom))' }}
        >
          <div className="animate-fade-in rounded-2xl bg-gray-900 px-6 py-4 shadow-2xl pointer-events-auto">
            <p className="text-sm text-white font-medium">
              {actions.timerErrorMessage}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

export default TodosPage
