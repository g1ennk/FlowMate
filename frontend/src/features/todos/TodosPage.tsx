import { useMemo, useRef, useState, useEffect, useCallback, type ReactNode } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { toast } from 'react-hot-toast'
import { z } from 'zod'
import {
  DndContext,
  closestCenter,
  pointerWithin,
  MeasuringStrategy,
  type CollisionDetection,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
  type DragOverEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { useTimerStore } from '../timer/timerStore'
import { Calendar } from '../../ui/Calendar'
import { formatDateKey } from '../../ui/calendarUtils'
import {
  BottomSheet,
  BottomSheetActions,
  BottomSheetActionButton,
  BottomSheetItem,
} from '../../ui/BottomSheet'
import {
  PlusIcon,
  EditIcon,
  TrashIcon,
  ClockIcon,
  DocumentIcon,
  MoreVerticalIcon,
} from '../../ui/Icons'
import { SortableTodoItem } from './components/SortableTodoItem'
import { TimerFullScreen } from '../timer/TimerFullScreen'
import { useTodoActions } from './useTodoActions'
import { useReorderTodos, useTodos } from './hooks'
import { getTimerInfo } from '../timer/useTimerInfo'
import { formatTimerHoursMinutes } from './todoTimerDisplay'
import { defaultMiniDaysSettings } from '../../lib/miniDays'
import { useMiniDaysSettings } from '../settings/hooks'
import type { Todo, TodoReorderItem } from '../../api/types'

// === 스키마 ===
const createSchema = z.object({
  title: z.string().min(1, '할 일을 입력하세요').max(200),
})
type CreateForm = z.infer<typeof createSchema>

type DropContainerId = `day-${number}-${'active' | 'done'}`

const getTodoOrder = (todo: { dayOrder?: number }) => todo.dayOrder ?? 0

type GroupedTodos = {
  active: Record<number, Todo[]>
  done: Record<number, Todo[]>
}

type ContainerItems = Record<DropContainerId, string[]>

type RectLike = { top: number; height: number }

const buildGroupedTodos = (list: Todo[], daySections: Array<{ id: number }>): GroupedTodos => {
  const active: Record<number, Todo[]> = {}
  const done: Record<number, Todo[]> = {}
  daySections.forEach((section) => {
    active[section.id] = []
    done[section.id] = []
  })

  for (const todo of list) {
    const miniDay = todo.miniDay ?? 0
    const target = todo.isDone ? done : active
    if (!target[miniDay]) target[miniDay] = []
    target[miniDay].push(todo)
  }

  const sortTodos = (list: Todo[]) =>
    [...list].sort((a, b) => {
      const aOrder = getTodoOrder(a)
      const bOrder = getTodoOrder(b)
      if (aOrder !== bOrder) return aOrder - bOrder
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    })

  daySections.forEach((section) => {
    active[section.id] = sortTodos(active[section.id])
    done[section.id] = sortTodos(done[section.id])
  })

  return { active, done }
}

const resolveActiveRect = (rect: unknown): RectLike | null => {
  const raw = (rect as { current?: unknown })?.current ?? rect
  const candidate = (raw as { translated?: unknown; initial?: unknown })?.translated ??
    (raw as { translated?: unknown; initial?: unknown })?.initial ??
    raw
  if (!candidate || typeof (candidate as RectLike).top !== 'number' || typeof (candidate as RectLike).height !== 'number') {
    return null
  }
  return candidate as RectLike
}

const getNextDayOrder = (list: Array<{ dayOrder?: number }>) =>
  list.length === 0 ? 0 : Math.max(...list.map((todo) => todo.dayOrder ?? 0)) + 1

const getContainerId = (miniDay: number, isDone: boolean): DropContainerId =>
  `day-${miniDay}-${isDone ? 'done' : 'active'}`

const parseContainerId = (id: DropContainerId) => {
  const parts = id.split('-')
  const parsedMiniDay = Number(parts[1])
  return {
    miniDay: Number.isNaN(parsedMiniDay) ? 0 : parsedMiniDay,
    isDone: parts[2] === 'done',
  }
}

const areContainerItemsEqual = (a: ContainerItems, b: ContainerItems) => {
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false
  for (const key of aKeys) {
    const aList = a[key as DropContainerId]
    const bList = b[key as DropContainerId]
    if (!aList || !bList) return false
    if (aList.length !== bList.length) return false
    for (let i = 0; i < aList.length; i += 1) {
      if (aList[i] !== bList[i]) return false
    }
  }
  return true
}

function DroppableList({
  id,
  children,
}: {
  id: DropContainerId
  children: ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div
      ref={setNodeRef}
      className={`min-h-[44px] space-y-1 rounded-lg py-1 transition-colors ${isOver ? 'bg-emerald-50/40' : ''}`}
    >
      {children}
    </div>
  )
}

function ActiveSectionDrop({
  id,
  className,
  children,
}: {
  id: DropContainerId
  className?: string
  children: ReactNode | ((isOver: boolean) => ReactNode)
}) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <section ref={setNodeRef} className={className}>
      {typeof children === 'function' ? children(isOver) : children}
    </section>
  )
}

// === 메인 컴포넌트 ===
function TodosPage() {
  const { data, isLoading } = useTodos()
  const store = useTimerStore()
  const timers = useTimerStore((s) => s.timers)
  const reorderTodos = useReorderTodos()

  // Global ticker is installed in AppProviders

  // 캘린더 상태
  const [selectedDate, setSelectedDate] = useState(new Date())
  const selectedDateKey = formatDateKey(selectedDate)
  const { data: miniDaysSettings = defaultMiniDaysSettings } = useMiniDaysSettings()

  const daySections = useMemo(
    () => [
      { id: 0, label: 'Day 0', title: '미분류', range: '' },
      {
        id: 1,
        label: 'Day 1',
        title: miniDaysSettings.day1.label,
        range: `${miniDaysSettings.day1.start}–${miniDaysSettings.day1.end}`,
      },
      {
        id: 2,
        label: 'Day 2',
        title: miniDaysSettings.day2.label,
        range: `${miniDaysSettings.day2.start}–${miniDaysSettings.day2.end}`,
      },
      {
        id: 3,
        label: 'Day 3',
        title: miniDaysSettings.day3.label,
        range: `${miniDaysSettings.day3.start}–${miniDaysSettings.day3.end}`,
      },
    ],
    [miniDaysSettings],
  )

  // Todo 액션 훅
  const actions = useTodoActions(selectedDateKey)

  // UI 상태
  const [inputDay, setInputDay] = useState<number | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const isSubmittingRef = useRef(false)
  const memoTextareaRef = useRef<HTMLTextAreaElement>(null)

  // 폼
  const {
    register,
    reset,
    getValues,
  } = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: { title: '' },
  })

  // === Helper 함수는 제거되고 useTimerInfo 사용 ===

  // === Memoized 데이터 ===
  const todosForSelectedDate = useMemo(() => {
    return (data?.items ?? []).filter((t) => t.date === selectedDateKey)
  }, [data?.items, selectedDateKey])

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

  // === DnD: multi-container live sorting state (option 2) ===
  const buildContainerItems = useCallback((grouped: GroupedTodos): ContainerItems => {
    const result = {} as ContainerItems
    for (const section of daySections) {
      const activeId = getContainerId(section.id, false)
      const doneId = getContainerId(section.id, true)
      result[activeId] = (grouped.active[section.id] ?? []).map((t) => t.id)
      result[doneId] = (grouped.done[section.id] ?? []).map((t) => t.id)
    }
    return result
  }, [daySections])

  const [containerItems, setContainerItems] = useState<ContainerItems>(() =>
    buildContainerItems(buildGroupedTodos([], daySections)),
  )
  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const clonedItemsRef = useRef<ContainerItems | null>(null)
  const dragOriginContainerRef = useRef<DropContainerId | null>(null)

  const todoById = useMemo(() => {
    const map = new Map<string, Todo>()
    for (const t of todosForSelectedDate) map.set(t.id, t)
    return map
  }, [todosForSelectedDate])

  const containerByTodoId = useMemo(() => {
    const map = new Map<string, DropContainerId>()
    for (const [cid, ids] of Object.entries(containerItems) as Array<[DropContainerId, string[]]>) {
      for (const id of ids) map.set(id, cid)
    }
    return map
  }, [containerItems])

  const findContainerFor = (id: string) => {
    if (id.startsWith('day-')) return id as DropContainerId
    return containerByTodoId.get(id) ?? null
  }

  const getTodosForContainer = (containerId: DropContainerId): Todo[] => {
    const ids = containerItems[containerId] ?? []
    const { miniDay, isDone } = parseContainerId(containerId)
    const items: Todo[] = []
    ids.forEach((id, index) => {
      const base = todoById.get(id)
      if (!base) return
      items.push({
        ...base,
        miniDay,
        isDone,
        dayOrder: index,
      })
    })
    return items
  }

  // Keep local DnD state in sync with server data when not dragging
  useEffect(() => {
    if (activeDragId) return
    const next = buildContainerItems(groupedTodos)
    setContainerItems((prev) => (areContainerItemsEqual(prev, next) ? prev : next))
  }, [activeDragId, groupedTodos, buildContainerItems])


  // 타이머 상태
  // === Effects ===
  // 메모 편집 모드로 전환 시 자동 포커스
  useEffect(() => {
    if (actions.noteEditMode && memoTextareaRef.current) {
      // 약간의 딜레이를 주어 DOM 업데이트 후 포커스
      setTimeout(() => {
        if (memoTextareaRef.current) {
          memoTextareaRef.current.focus()
          // 커서를 텍스트 끝으로 이동
          const length = memoTextareaRef.current.value.length
          memoTextareaRef.current.setSelectionRange(length, length)
        }
      }, 0)
    }
  }, [actions.noteEditMode])

  // === 핸들러 ===

  // DnD
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const collisionDetectionStrategy: CollisionDetection = (args) => {
    const isContainerId = (id: unknown) => String(id).startsWith('day-')
    const pointerCollisions = pointerWithin(args)
    if (pointerCollisions.length > 0) {
      const itemCollisions = pointerCollisions.filter((collision) => !isContainerId(collision.id))
      if (itemCollisions.length > 0) {
        const itemIds = new Set(itemCollisions.map((collision) => String(collision.id)))
        const itemContainers = args.droppableContainers.filter((droppable) =>
          itemIds.has(String(droppable.id)),
        )
        if (itemContainers.length > 0) {
          return closestCenter({ ...args, droppableContainers: itemContainers })
        }
      }

      const containerCollision = pointerCollisions.find((collision) => isContainerId(collision.id))
      if (containerCollision) {
        const containerId = containerCollision.id as DropContainerId
        const containerTodos = getTodosForContainer(containerId)
        if (containerTodos.length === 0) return [containerCollision]

        const containerIds = new Set(containerTodos.map((todo) => todo.id))
        const itemContainers = args.droppableContainers.filter((droppable) =>
          containerIds.has(String(droppable.id)),
        )
        if (itemContainers.length === 0) return [containerCollision]

        if (args.pointerCoordinates) {
          const firstId = containerTodos[0]?.id
          const lastId = containerTodos[containerTodos.length - 1]?.id
          const firstContainer = itemContainers.find((droppable) => String(droppable.id) === firstId)
          const lastContainer = itemContainers.find((droppable) => String(droppable.id) === lastId)
          const firstRect = firstContainer?.rect.current
          const lastRect = lastContainer?.rect.current
          if (lastRect && args.pointerCoordinates.y > lastRect.bottom) {
            return [containerCollision]
          }
          if (firstRect && args.pointerCoordinates.y < firstRect.top) {
            return [firstContainer ?? containerCollision]
          }
        }

        return closestCenter({ ...args, droppableContainers: itemContainers })
      }

      return pointerCollisions
    }
    return closestCenter(args)
  }

  const blockFocusStats = useMemo(() => {
    const totals: Record<number, number> = {}
    const doneTotals: Record<number, number> = {}
    daySections.forEach((section) => {
      totals[section.id] = 0
      doneTotals[section.id] = 0
    })

    for (const todo of todosForSelectedDate) {
      const miniDay = todo.miniDay ?? 0
      const timer = timers[todo.id]
      const sessionHistory = timer?.sessionHistory ?? []
      const focusSeconds =
        sessionHistory.length > 0
          ? Math.floor(sessionHistory.reduce((s, session) => s + session.focusMs, 0) / 1000)
          : todo.focusSeconds
      totals[miniDay] = (totals[miniDay] ?? 0) + focusSeconds
      if (todo.isDone) {
        doneTotals[miniDay] = (doneTotals[miniDay] ?? 0) + focusSeconds
      }
    }

    const totalAll = daySections.reduce((sum, section) => sum + (totals[section.id] ?? 0), 0)
    return { totals, doneTotals, totalAll }
  }, [daySections, todosForSelectedDate, timers])

  const getTodoTimerProps = (todo: { id: string }) => {
    const timer = store.getTimer(todo.id)
    const info = getTimerInfo(timer)
    return {
      timer,
      ...info,
      sessionHistory: timer?.sessionHistory ?? [],
      initialFocusMs: timer?.initialFocusMs ?? 0,
    }
  }

  const handleDragStart = (event: DragStartEvent) => {
    const id = String(event.active.id)
    setActiveDragId(id)
    clonedItemsRef.current = containerItems
    dragOriginContainerRef.current = findContainerFor(id)
  }

  const handleDragOver = (event: DragOverEvent) => {
    if (!event.over) return
    const activeId = String(event.active.id)
    const overId = String(event.over.id)
    const isOverContainer = overId.startsWith('day-')
    const activeRect = resolveActiveRect(event.active.rect)
    const activeTop = activeRect?.top ?? 0
    const overRect = event.over.rect
    const isBelowOverItem = !isOverContainer && activeTop > overRect.top + overRect.height / 2

    const activeContainer = findContainerFor(activeId)
    const overContainer = findContainerFor(overId)
    if (!activeContainer || !overContainer) return

    if (activeContainer === overContainer) return

    // Disallow active <-> done moves
    const from = parseContainerId(activeContainer)
    const to = parseContainerId(overContainer)
    if (from.isDone !== to.isDone) return

    setContainerItems((prev) => {
      const next = { ...prev }
      const fromItems = [...(next[activeContainer] ?? [])]
      const toItems = [...(next[overContainer] ?? [])]

      const fromIndex = fromItems.indexOf(activeId)
      if (fromIndex === -1) return prev

      fromItems.splice(fromIndex, 1)

      const overIndex = isOverContainer ? toItems.length : toItems.indexOf(overId)
      if (!isOverContainer && overIndex === -1) return prev

      const insertIndex = isOverContainer ? toItems.length : overIndex + (isBelowOverItem ? 1 : 0)
      toItems.splice(Math.max(0, Math.min(insertIndex, toItems.length)), 0, activeId)

      next[activeContainer] = fromItems
      next[overContainer] = toItems
      return next
    })
  }

  const handleDragEnd = (event: DragEndEvent) => {
    if (!event.over) {
      setActiveDragId(null)
      clonedItemsRef.current = null
      dragOriginContainerRef.current = null
      return
    }

    const activeId = String(event.active.id)
    const overId = String(event.over.id)
    const isOverContainer = overId.startsWith('day-')
    const activeRect = resolveActiveRect(event.active.rect)
    const activeTop = activeRect?.top ?? 0
    const overRect = event.over.rect
    const isBelowOverItem = !isOverContainer && activeTop > overRect.top + overRect.height / 2

    const activeContainer = findContainerFor(activeId)
    const overContainer = findContainerFor(overId)
    if (!activeContainer || !overContainer) {
      setActiveDragId(null)
      clonedItemsRef.current = null
      dragOriginContainerRef.current = null
      return
    }

    // Disallow active <-> done moves
    const from = parseContainerId(activeContainer)
    const to = parseContainerId(overContainer)
    if (from.isDone !== to.isDone) {
      setActiveDragId(null)
      clonedItemsRef.current = null
      dragOriginContainerRef.current = null
      return
    }

    // If same container, we still want to reorder based on final over position
    setContainerItems((prev) => {
      const next = { ...prev }
      const items = [...(next[activeContainer] ?? [])]
      const oldIndex = items.indexOf(activeId)
      if (oldIndex === -1) return prev

      const newIndex = isOverContainer
        ? items.length - 1
        : items.indexOf(overId) + (isBelowOverItem ? 1 : 0)

      if (!isOverContainer && newIndex === -1) return prev

      next[activeContainer] = arrayMove(items, oldIndex, Math.max(0, Math.min(newIndex, items.length - 1)))
      return next
    })

    // Build reorder payload for the affected containers from the current (already-updated) state
    // Note: since setState is async, compute using a snapshot derived from containerItems PLUS the event intent.
    const snapshot = (() => {
      const current = containerItems
      const next = { ...current }
      const fromItems = [...(next[activeContainer] ?? [])]
      const toItems = activeContainer === overContainer ? fromItems : [...(next[overContainer] ?? [])]

      const fromIndex = fromItems.indexOf(activeId)
      if (fromIndex === -1) return current

      if (activeContainer === overContainer) {
        const newIndex = isOverContainer
          ? fromItems.length - 1
          : fromItems.indexOf(overId) + (isBelowOverItem ? 1 : 0)
        if (!isOverContainer && newIndex === -1) return current
        next[activeContainer] = arrayMove(
          fromItems,
          fromIndex,
          Math.max(0, Math.min(newIndex, fromItems.length - 1)),
        )
        return next
      }

      // move across containers
      fromItems.splice(fromIndex, 1)
      const overIndex = isOverContainer ? toItems.length : toItems.indexOf(overId)
      if (!isOverContainer && overIndex === -1) return current
      const insertIndex = isOverContainer ? toItems.length : overIndex + (isBelowOverItem ? 1 : 0)
      toItems.splice(Math.max(0, Math.min(insertIndex, toItems.length)), 0, activeId)

      next[activeContainer] = fromItems
      next[overContainer] = toItems
      return next
    })()

    const buildReorderItemsFor = (containerId: DropContainerId): TodoReorderItem[] => {
      const ids = snapshot[containerId] ?? []
      const { miniDay } = parseContainerId(containerId)
      return ids.map((id, index) => ({
        id,
        dayOrder: index,
        miniDay,
      }))
    }

    const affected = new Set<DropContainerId>()
    affected.add(activeContainer)
    affected.add(overContainer)
    if (dragOriginContainerRef.current) affected.add(dragOriginContainerRef.current)

    const reorderItems = Array.from(affected).flatMap(buildReorderItemsFor)
    if (reorderItems.length > 0) {
      reorderTodos.mutate({ items: reorderItems })
    }

    setActiveDragId(null)
    clonedItemsRef.current = null
    dragOriginContainerRef.current = null
  }

  const handleDragCancel = () => {
    if (clonedItemsRef.current) {
      setContainerItems(clonedItemsRef.current)
    }
    setActiveDragId(null)
    clonedItemsRef.current = null
    dragOriginContainerRef.current = null
  }


  return (
    <div className="space-y-4">
      {/* 캘린더 */}
      <Calendar
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        onMonthChange={setSelectedDate}
        markedDates={markedDates}
      />

      {/* Todo 리스트 카드 */}
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        {/* 헤더 */}
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
        </div>

        {/* 로딩 */}
        {isLoading && <div className="py-8 text-center text-sm text-gray-400">불러오는 중...</div>}

        {!isLoading && (
          <DndContext
            sensors={sensors}
            collisionDetection={collisionDetectionStrategy}
            measuring={{ droppable: { strategy: MeasuringStrategy.WhileDragging } }}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragCancel={handleDragCancel}
            onDragEnd={handleDragEnd}
          >
            <div className="space-y-6">
              {daySections.map((section, index) => {
                const activeTodos = getTodosForContainer(getContainerId(section.id, false))
                const doneTodos = getTodosForContainer(getContainerId(section.id, true))
                const activeContainerId = getContainerId(section.id, false)
                const doneContainerId = getContainerId(section.id, true)
                const isInputOpen = inputDay === section.id
                const nextDoneOrder = getNextDayOrder(groupedTodos.done[section.id] ?? [])
                const nextActiveOrder = getNextDayOrder(groupedTodos.active[section.id] ?? [])
                const dayFocus = blockFocusStats.totals[section.id] ?? 0
                const doneFocus = blockFocusStats.doneTotals[section.id] ?? 0
                const emptyMessage =
                  section.id === 0
                    ? '아직 분류되지 않은 할 일이 없어요'
                    : `아직 ${section.title}에 할 일이 없어요`

                return (
                  <section
                    key={section.id}
                    className={`${index === 0 ? '' : 'border-t border-gray-100 pt-5'} space-y-2`}
                  >
                    <ActiveSectionDrop id={activeContainerId} className="space-y-2 pb-3">
                      {(isActiveOver) => (
                        <>
                          <div className="flex items-center justify-between">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-sm font-semibold text-gray-900">
                                {section.label} · {section.title}
                              </h3>
                              {section.range && <span className="text-xs text-gray-400">{section.range}</span>}
                              {dayFocus > 0 && (
                                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                                  Flow · {formatTimerHoursMinutes(dayFocus)}
                                </span>
                              )}
                            </div>
                            <button
                              onClick={() =>
                                setInputDay((current) => (current === section.id ? null : section.id))
                              }
                              className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-white transition-colors"
                            >
                              <PlusIcon className="h-4 w-4" />
                            </button>
                          </div>

                          <div
                            className={`min-h-[44px] space-y-1 rounded-lg py-1 transition-colors ${isActiveOver ? 'bg-emerald-50/40' : ''}`}
                          >
                            {activeTodos.length === 0 && doneTodos.length === 0 && !isInputOpen && (
                              <p className="px-2 py-1 text-xs text-gray-400 pointer-events-none">
                                {emptyMessage}
                              </p>
                            )}
                            <SortableContext
                              id={activeContainerId}
                              items={activeTodos.map((t) => t.id)}
                              strategy={verticalListSortingStrategy}
                            >
                              {activeTodos.map((todo) => {
                                const {
                                  timer,
                                  isActiveTimer,
                                  activeTimerElapsedMs,
                                  activeTimerRemainingMs,
                                  activeTimerPhase,
                                  breakElapsedMs,
                                  breakTargetMs,
                                  isBreakPhase,
                                  flexiblePhase,
                                  sessionHistory,
                                  initialFocusMs,
                                } = getTodoTimerProps(todo)

                                return (
                                  <SortableTodoItem
                                    key={todo.id}
                                    id={todo.id}
                                    title={todo.title}
                                    note={todo.note}
                                    pomodoroDone={todo.pomodoroDone}
                                    focusSeconds={todo.focusSeconds}
                                    isDone={todo.isDone}
                                    isEditing={actions.editingId === todo.id}
                                    editingTitle={actions.editingTitle}
                                    onEditingTitleChange={actions.setEditingTitle}
                                    onToggle={() =>
                                      actions.handleToggleDone(todo.id, !todo.isDone, nextDoneOrder)
                                    }
                                    onEdit={() => actions.handleEdit(todo.id, todo.title)}
                                    onSaveEdit={actions.handleSaveEdit}
                                    onCancelEdit={actions.handleCancelEdit}
                                    onDelete={() => actions.handleDelete(todo.id)}
                                    onOpenMenu={() => actions.setSelectedTodo(todo)}
                                    onOpenTimer={() => {
                                      const modeToUse = timer?.mode || todo.timerMode || null
                                      actions.handleOpenTimer(todo, modeToUse)
                                    }}
                                    onOpenNote={() => actions.handleOpenNote(todo)}
                                    isActiveTimer={isActiveTimer}
                                    activeTimerMode={timer?.mode}
                                    activeTimerElapsedMs={activeTimerElapsedMs}
                                    activeTimerRemainingMs={activeTimerRemainingMs}
                                    activeTimerPhase={activeTimerPhase}
                                    breakElapsedMs={breakElapsedMs}
                                    breakTargetMs={breakTargetMs}
                                    isBreakPhase={isBreakPhase}
                                    flexiblePhase={flexiblePhase}
                                    sessionHistory={sessionHistory}
                                    initialFocusMs={initialFocusMs}
                                  />
                                )
                              })}
                            </SortableContext>

                            {isInputOpen && (
                              <div className="rounded-xl p-2">
                                <div className="flex items-start gap-3 rounded-lg px-2 py-1 -mx-2 -my-1">
                                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-gray-300 bg-transparent opacity-50 mt-0.5" />
                                  <textarea
                                    {...register('title')}
                                    ref={(e) => {
                                      register('title').ref(e)
                                      inputRef.current = e
                                      if (e) {
                                        e.style.height = 'auto'
                                        e.style.height = `${e.scrollHeight}px`
                                      }
                                    }}
                                    placeholder="할 일 입력"
                                    autoFocus
                                    onKeyDown={async (e) => {
                                      if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault()
                                        if (isSubmittingRef.current) return

                                        const title = getValues('title')
                                        if (title?.trim()) {
                                          isSubmittingRef.current = true
                                          try {
                                            await actions.handleCreate(title, section.id, nextActiveOrder)
                                            reset()
                                            setTimeout(() => {
                                              if (inputRef.current) {
                                                inputRef.current.focus()
                                                inputRef.current.style.height = 'auto'
                                                inputRef.current.style.height = `${inputRef.current.scrollHeight}px`
                                              }
                                            }, 0)
                                          } catch (err) {
                                            toast.error('추가 실패', { id: 'todo-create-failed' })
                                            console.error(err)
                                          } finally {
                                            isSubmittingRef.current = false
                                          }
                                        }
                                      }
                                    }}
                                    onChange={(e) => {
                                      register('title').onChange(e)
                                      e.target.style.height = 'auto'
                                      e.target.style.height = `${e.target.scrollHeight}px`
                                    }}
                                    onBlur={async () => {
                                      if (isSubmittingRef.current) return

                                      const title = getValues('title')
                                      if (title?.trim()) {
                                        isSubmittingRef.current = true
                                        try {
                                          await actions.handleCreate(title, section.id, nextActiveOrder)
                                          reset()
                                          setInputDay(null)
                                        } catch (err) {
                                          toast.error('추가 실패', { id: 'todo-create-failed' })
                                          console.error(err)
                                        } finally {
                                          isSubmittingRef.current = false
                                        }
                                      } else {
                                        setInputDay(null)
                                      }
                                    }}
                                    className="flex-1 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400 resize-none overflow-hidden min-h-[20px]"
                                    rows={1}
                                  />
                                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-gray-300 opacity-50">
                                    <MoreVerticalIcon className="h-4 w-4" />
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </ActiveSectionDrop>
                    {doneTodos.length > 0 && (
                      <div className="space-y-1">
                        {activeTodos.length > 0 && (
                          <div className="py-2">
                            <div className="flex items-center gap-2">
                              <p className="text-xs font-medium text-gray-400">
                                완료됨{doneFocus > 0 ? ` · ${formatTimerHoursMinutes(doneFocus)}` : ''}
                              </p>
                            </div>
                          </div>
                        )}
                        <DroppableList id={doneContainerId}>
                          <SortableContext
                            id={doneContainerId}
                            items={doneTodos.map((t) => t.id)}
                            strategy={verticalListSortingStrategy}
                          >
                            {doneTodos.map((todo) => {
                              const {
                                timer,
                                isActiveTimer,
                                activeTimerElapsedMs,
                                activeTimerRemainingMs,
                                activeTimerPhase,
                                sessionHistory,
                                initialFocusMs,
                              } = getTodoTimerProps(todo)

                              return (
                                <SortableTodoItem
                                  key={todo.id}
                                  id={todo.id}
                                  title={todo.title}
                                  note={todo.note}
                                  pomodoroDone={todo.pomodoroDone}
                                  focusSeconds={todo.focusSeconds}
                                  isDone={todo.isDone}
                                  isEditing={actions.editingId === todo.id}
                                  editingTitle={actions.editingTitle}
                                  onEditingTitleChange={actions.setEditingTitle}
                                  onToggle={() =>
                                    actions.handleToggleDone(todo.id, !todo.isDone, nextActiveOrder)
                                  }
                                  onEdit={() => actions.handleEdit(todo.id, todo.title)}
                                  onSaveEdit={actions.handleSaveEdit}
                                  onCancelEdit={actions.handleCancelEdit}
                                  onDelete={() => actions.handleDelete(todo.id)}
                                  onOpenMenu={() => actions.setSelectedTodo(todo)}
                                  onOpenTimer={() => {
                                    const modeToUse = timer?.mode || todo.timerMode || null
                                    actions.handleOpenTimer(todo, modeToUse)
                                  }}
                                  onOpenNote={() => actions.handleOpenNote(todo)}
                                  isActiveTimer={isActiveTimer}
                                  activeTimerMode={timer?.mode}
                                  activeTimerElapsedMs={activeTimerElapsedMs}
                                  activeTimerRemainingMs={activeTimerRemainingMs}
                                  activeTimerPhase={activeTimerPhase}
                                  sessionHistory={sessionHistory}
                                  initialFocusMs={initialFocusMs}
                                />
                              )
                            })}
                          </SortableContext>
                        </DroppableList>
                      </div>
                    )}
                  </section>
                )
              })}
            </div>
          </DndContext>
        )}
      </div>

      {/* Todo 액션 바텀시트 */}
      <BottomSheet
        isOpen={!!actions.selectedTodo && !actions.showNoteModal}
        onClose={() => {
          actions.setSelectedTodo(null)
          actions.setTimerErrorMessage(null)
        }}
        title={actions.selectedTodo?.title}
      >
        <BottomSheetActions>
          <BottomSheetActionButton
            icon={<EditIcon className="h-6 w-6" />}
            label="수정하기"
            onClick={() => actions.selectedTodo && actions.handleEdit(actions.selectedTodo.id, actions.selectedTodo.title)}
          />
          <BottomSheetActionButton
            icon={<TrashIcon className="h-6 w-6" />}
            label="삭제하기"
            onClick={() => actions.selectedTodo && actions.handleDelete(actions.selectedTodo.id)}
            variant="danger"
          />
        </BottomSheetActions>
        <div className="space-y-1">
          <BottomSheetItem
            icon={<DocumentIcon className="h-5 w-5 text-yellow-400" />}
            label="메모"
            onClick={() => actions.selectedTodo && actions.handleOpenNote(actions.selectedTodo)}
          />
          {actions.selectedTodo && (() => {
            // 현재 선택된 태스크의 타이머 상태
            const currentTimer = store.getTimer(actions.selectedTodo.id)
            const currentTimerRunning = currentTimer?.status === 'running'

            // 다른 태스크에서 실행 중인 타이머 찾기
            const allTimerEntries = Object.entries(store.timers)
            const otherRunningTimer = allTimerEntries.find(
              ([todoId, timer]) => timer.status === 'running' && todoId !== actions.selectedTodo?.id
            )

            const isCompleted = actions.selectedTodo.isDone

            // 일반 타이머 비활성화 조건
            // 1. 완료된 태스크
            // 2. 다른 태스크에서 타이머 실행 중
            // 3. 같은 태스크에서 뽀모도로 실행 중
            const disableStopwatch =
              isCompleted ||
              !!otherRunningTimer ||
              (currentTimerRunning && currentTimer.mode === 'pomodoro')

            // 뽀모도로 타이머 비활성화 조건
            // 1. 완료된 태스크
            // 2. 다른 태스크에서 타이머 실행 중
            // 3. 같은 태스크에서 일반 타이머 실행 중
            const disablePomodoro =
              isCompleted ||
              !!otherRunningTimer ||
              (currentTimerRunning && currentTimer.mode === 'stopwatch')

            return (
              <>
                {/* 일반 타이머 */}
                <BottomSheetItem
                  icon={<ClockIcon className="h-5 w-5 text-emerald-500" />}
                  label="일반 타이머"
                  onClick={() => {
                    if (!actions.selectedTodo) return
                    if (isCompleted) {
                      actions.setTimerErrorMessage('완료된 태스크는 타이머를 시작할 수 없습니다')
                      return
                    }
                    if (otherRunningTimer) {
                      actions.setTimerErrorMessage('다른 타이머가 실행 중입니다')
                      return
                    }
                    if (currentTimerRunning && currentTimer.mode === 'pomodoro') {
                      actions.setTimerErrorMessage('뽀모도로 타이머가 실행 중입니다')
                      return
                    }
                    actions.handleOpenTimer(actions.selectedTodo, 'stopwatch')
                  }}
                  disabled={disableStopwatch}
                />

                {/* 뽀모도로 타이머 */}
                <BottomSheetItem
                  icon={<ClockIcon className="h-5 w-5 text-red-500" />}
                  label="뽀모도로 타이머"
                  onClick={() => {
                    if (!actions.selectedTodo) return
                    if (isCompleted) {
                      actions.setTimerErrorMessage('완료된 태스크는 타이머를 시작할 수 없습니다')
                      return
                    }
                    if (otherRunningTimer) {
                      actions.setTimerErrorMessage('다른 타이머가 실행 중입니다')
                      return
                    }
                    if (currentTimerRunning && currentTimer.mode === 'stopwatch') {
                      actions.setTimerErrorMessage('일반 타이머가 실행 중입니다')
                      return
                    }
                    actions.handleOpenTimer(actions.selectedTodo, 'pomodoro')
                  }}
                  disabled={disablePomodoro}
                />
              </>
            )
          })()}
        </div>
      </BottomSheet>

      {/* 메모 바텀시트 */}
      <BottomSheet
        isOpen={actions.showNoteModal}
        onClose={actions.handleCloseNote}
      >
        {/* 커스텀 헤더 */}
        <div className="mb-4 -mt-2">
          <div className="flex items-center justify-between">
            {actions.noteEditMode ? (
              <>
                <button
                  onClick={actions.handleDeleteNote}
                  className="text-sm font-medium text-red-600 transition-colors hover:text-red-700"
                >
                  삭제
                </button>
                <h3 className="text-base font-semibold text-gray-900">
                  {actions.noteTodo?.title || '메모'}
                </h3>
                <button
                  onClick={actions.handleSaveNote}
                  className="text-sm font-medium text-gray-900 transition-colors hover:text-gray-700"
                >
                  완료
                </button>
              </>
            ) : (
              <>
                <div className="w-8"></div>
                <h3 className="text-base font-semibold text-gray-900">
                  {actions.noteTodo?.title || '메모'}
                </h3>
                <div className="w-8"></div>
              </>
            )}
          </div>
        </div>

        {/* 단일 textarea - 읽기/편집 모드 전환 */}
        <textarea
          ref={memoTextareaRef}
          value={actions.noteText}
          onChange={(e) => actions.setNoteText(e.target.value)}
          onClick={!actions.noteEditMode ? actions.handleEditNote : undefined}
          readOnly={!actions.noteEditMode}
          placeholder="메모를 입력하세요..."
          className={`mb-4 h-40 w-full resize-none rounded-xl bg-yellow-50 border border-yellow-200 p-3 text-sm text-gray-900 outline-none placeholder:text-gray-400 ${
            !actions.noteEditMode ? 'cursor-pointer' : ''
          }`}
        />
      </BottomSheet>

      {/* 타이머 풀스크린 */}
      <TimerFullScreen
        isOpen={!!actions.timerTodo}
        onClose={actions.handleCloseTimer}
        todoId={actions.timerTodo?.id ?? ''}
        todoTitle={actions.timerTodo?.title ?? ''}
        pomodoroDone={actions.timerTodo?.pomodoroDone ?? 0}
        focusSeconds={actions.timerTodo?.focusSeconds ?? 0}
        initialMode={actions.timerMode ?? undefined}
        isDone={actions.timerTodo?.isDone ?? false}
      />

      {/* 타이머 에러 메시지 (하단 중앙 floating) */}
      {actions.timerErrorMessage && (
        <div className="fixed bottom-20 left-0 right-0 z-[10000] flex justify-center px-6 pointer-events-none">
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
