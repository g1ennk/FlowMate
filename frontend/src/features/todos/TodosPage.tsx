import { Fragment, useMemo, useRef, useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { DndContext } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useTimerStore, type SingleTimerState } from '../timer/timerStore'
import { Calendar, type ViewMode } from '../../ui/Calendar'
import { formatDateKey } from '../../lib/time'
import { PlusIcon, ChevronRightIcon, CheckIcon } from '../../ui/Icons'
import { SortableTodoItem } from './components/SortableTodoItem'
import { BatchActionBar } from './components/BatchActionBar'
import { TodoDatePickerSheet } from './components/TodoDatePickerSheet'
import { NoteModal } from './components/NoteModal'
import { TodoInputForm } from './components/TodoInputForm'
import { TodoMenuSheet } from './components/TodoMenuSheet'
import { ActiveSectionDrop, SectionGuideCard, CrossSectionPreviewSlot } from './components/TodoSectionParts'
import { TimerFullScreen } from '../timer/TimerFullScreen'
import { useTodoActions } from './useTodoActions'
import { useBatchSelect } from './useBatchSelect'
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
import { useCoachMark } from '../../lib/useCoachMark'
import { CoachMark } from '../../ui/CoachMark'
import { TodosSkeleton } from '../../ui/Skeleton'
import type { Todo } from '../../api/types'
import {
  buildGroupedTodos,
  buildInitialOpenSections,
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
      { id: 0, title: '미분류', range: '언제든' },
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
  const batch = useBatchSelect()
  const todosCoach = useCoachMark('todos-intro')
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

  const getTodoTimer = (todoId: string): SingleTimerState | undefined => getTimer(todoId)

  const openQuickInputForSection = (sectionId: number) => {
    setOpenSections((prev) => ({ ...prev, [sectionId]: true }))
    setInputDay(sectionId)
  }

  const closeInputForSection = (sectionId: number) => {
    setInputDay(null)
    if (!sectionHasTodos(groupedTodos, sectionId)) {
      setOpenSections((prev) => ({ ...prev, [sectionId]: false }))
    }
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
        selectMode={batch.selectMode}
        isSelected={batch.selectedIds.has(todo.id)}
        onSelect={() => batch.toggleSelect(todo.id)}
      />
    )
  }

  return (
    <div className="animate-fade-in-up space-y-section">
      <Calendar
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        onMonthChange={setSelectedDate}
        markedDates={markedDates}
        viewMode={calendarViewMode}
        onViewModeChange={handleCalendarViewModeChange}
      />

      <CoachMark
        message={"할 일을 추가하고, ▶ 를 눌러 집중 타이머를 시작해보세요.\n섹션을 드래그해서 순서를 바꿀 수도 있어요."}
        visible={todosCoach.visible}
        onDismiss={todosCoach.dismiss}
        className="mb-2"
      />

      <div className="rounded-2xl bg-surface-card p-card shadow-sm">
        <div className="mb-section flex items-center justify-between">
          <div className="flex items-center gap-list">
            <h2 className="text-base font-semibold text-text-primary">
              {selectedDate.getMonth() + 1}월 {selectedDate.getDate()}일
            </h2>
            {blockFocusStats.totalAll > 0 && (
              <span className="rounded-full bg-accent-subtle px-2 py-0.5 text-xs font-semibold text-accent-text">
                총 Flow · {formatTimerHoursMinutes(blockFocusStats.totalAll)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {todosForSelectedDate.length > 0 && (
              <button
                onClick={batch.selectMode ? batch.exitSelectMode : batch.enterSelectMode}
                className={`flex items-center gap-1 text-xs font-medium transition-colors ${
                  batch.selectMode
                    ? 'text-accent hover:text-accent-hover'
                    : 'text-text-tertiary hover:text-text-secondary'
                }`}
              >
                {batch.selectMode ? (
                  <>
                    <CheckIcon className="h-3 w-3" strokeWidth={2.5} />
                    <span>취소</span>
                  </>
                ) : (
                  <span>선택</span>
                )}
              </button>
            )}
            <button
              onClick={() => {
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
              }}
              className="flex items-center gap-1 text-xs font-medium text-text-tertiary hover:text-text-secondary"
            >
              <span>{isAllOpen ? '모두 접기' : '모두 펼침'}</span>
              <ChevronRightIcon
                className={`h-3 w-3 transition-transform ${isAllOpen ? '-rotate-90' : 'rotate-90'}`}
              />
            </button>
          </div>
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
          >
            <div className="space-y-list">
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
                const shouldShowGuide = isCurrentTimeSection || section.id === 0
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
                    className={`${index === 0 ? '' : 'border-t border-border-subtle pt-card'} space-y-element`}
                  >
                    <ActiveSectionDrop id={containerId} className="space-y-element pb-list">
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
                              className="-m-2 mt-0.5 flex items-center justify-center rounded-full p-2 text-text-tertiary hover:bg-hover-strong"
                            >
                              <ChevronRightIcon
                                className={`h-4 w-4 transition-transform ${isSectionOpen ? 'rotate-90' : ''}`}
                              />
                            </button>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-list">
                                <h3 className="text-sm font-semibold text-text-primary">{section.title}</h3>
                                {totalCount > 0 && (
                                  <span className="text-xs text-text-tertiary">
                                    남음 {activeTodos.length} · 완료 {doneTodos.length}
                                  </span>
                                )}
                                {isCurrentTimeSection && (
                                  <span className="rounded-full bg-accent-muted px-2 py-0.5 text-[11px] font-semibold text-accent-text">
                                    현재 시간대
                                  </span>
                                )}
                              </div>
                              {(hasRangeMeta || hasFlowMeta) && (
                                <div className="mt-0.5 flex min-h-[18px] flex-wrap items-center gap-list">
                                  {hasRangeMeta && (
                                    <span
                                      className={`text-xs text-text-tertiary ${
                                        showRangeOnMobile ? 'inline-flex' : 'hidden sm:inline-flex'
                                      }`}
                                    >
                                      {section.range}
                                    </span>
                                  )}
                                  {hasFlowMeta && (
                                    <span
                                      className={`rounded-full bg-accent-subtle px-2 py-0.5 text-xs font-semibold text-accent-text ${
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
                              className="mt-0.5 inline-flex h-8 w-8 items-center justify-center justify-self-end rounded-full text-accent-text transition-colors hover:bg-hover-strong"
                            >
                              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-accent text-text-inverse">
                                <PlusIcon className="h-2.5 w-2.5" />
                              </span>
                            </button>
                          </div>
                          {isSectionOpen && (
                            <div className="space-y-0.5 rounded-lg py-0.5">
                              {!shouldShowInput && isEmptySection && shouldShowGuide && (
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
                              {!shouldShowInput && isEmptySection && !shouldShowGuide && (
                                <p className="px-2 py-list text-sm text-text-tertiary">
                                  + 버튼으로 할 일을 추가해보세요.
                                </p>
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
                                    onClose={() => closeInputForSection(section.id)}
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
                                    onClose={() => closeInputForSection(section.id)}
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
        todoTitle={actions.timerTodo?.title ?? ''}
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
          <div className="animate-fade-in rounded-2xl bg-text-primary px-6 py-4 shadow-2xl pointer-events-auto">
            <p className="text-sm text-text-inverse font-medium">
              {actions.timerErrorMessage}
            </p>
          </div>
        </div>
      )}

      {batch.selectMode && (
        <BatchActionBar
          selectedCount={batch.selectedCount}
          onComplete={batch.batchComplete}
          onDelete={batch.batchDelete}
          onCancel={batch.exitSelectMode}
        />
      )}
    </div>
  )
}

export default TodosPage
