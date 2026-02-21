import { useMemo, useRef, useState, useEffect, useCallback, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
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
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
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
  ChevronRightIcon,
} from '../../ui/Icons'
import { SortableTodoItem } from './components/SortableTodoItem'
import { TimerFullScreen } from '../timer/TimerFullScreen'
import { useTodoActions } from './useTodoActions'
import { useReorderTodos, useTodos } from './hooks'
import { getTimerInfo } from '../timer/useTimerInfo'
import { formatTimerHoursMinutes } from './todoTimerDisplay'
import { defaultMiniDaysSettings } from '../../lib/miniDays'
import { useMiniDaysSettings } from '../settings/hooks'
import { getDefaultMiniDayForDate } from './miniDayUtils'
import type { Todo, TodoReorderItem } from '../../api/types'

// === 스키마 ===
const createSchema = z.object({
  title: z.string().min(1, '할 일을 입력하세요').max(200),
})
type CreateForm = z.infer<typeof createSchema>

type DropContainerId = `day-${number}`

const getTodoOrder = (todo: { dayOrder?: number }) => todo.dayOrder ?? 0

type GroupedTodos = Record<number, Todo[]>

type ContainerItems = Record<DropContainerId, string[]>

type RectLike = { top: number; height: number }

const buildGroupedTodos = (list: Todo[], daySections: Array<{ id: number }>): GroupedTodos => {
  const grouped: Record<number, Todo[]> = {}
  daySections.forEach((section) => {
    grouped[section.id] = []
  })

  for (const todo of list) {
    const miniDay = todo.miniDay ?? 0
    if (!grouped[miniDay]) grouped[miniDay] = []
    grouped[miniDay].push(todo)
  }

  const sortTodos = (items: Todo[]) =>
    [...items].sort((a, b) => {
      const doneDiff = Number(a.isDone) - Number(b.isDone)
      if (doneDiff !== 0) return doneDiff
      const aOrder = getTodoOrder(a)
      const bOrder = getTodoOrder(b)
      if (aOrder !== bOrder) return aOrder - bOrder
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    })

  daySections.forEach((section) => {
    grouped[section.id] = sortTodos(grouped[section.id])
  })

  return grouped
}

const addSpacer = (items: string[], id: string, index: number) => {
  if (items.includes(id)) return items
  const next = [...items]
  const safeIndex = Math.max(0, Math.min(index, next.length))
  next.splice(safeIndex, 0, id)
  return next
}

const removeSpacer = (items: string[], id: string) => items.filter((item) => item !== id)

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

const getContainerId = (miniDay: number): DropContainerId => `day-${miniDay}`

const parseContainerId = (id: DropContainerId) => {
  const parts = id.split('-')
  const parsedMiniDay = Number(parts[1])
  return Number.isNaN(parsedMiniDay) ? 0 : parsedMiniDay
}

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/

const parseDateParam = (value: string | null) => {
  if (!value || !DATE_KEY_RE.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return null
  const candidate = new Date(year, month - 1, day)
  if (
    candidate.getFullYear() !== year ||
    candidate.getMonth() !== month - 1 ||
    candidate.getDate() !== day
  ) {
    return null
  }
  return candidate
}

const buildDefaultOpenSections = (defaultOpenId: number): Record<number, boolean> => ({
  0: true, // 미분류는 기본 진입 시 항상 펼침
  [defaultOpenId]: true,
})

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

function SortableInput({
  id,
  children,
}: {
  id: string
  children: ReactNode
}) {
  const { setNodeRef, transform, transition } = useSortable({ id, disabled: true })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div ref={setNodeRef} style={style}>
      {children}
    </div>
  )
}

// === 메인 컴포넌트 ===
function TodosPage() {
  const { data, isLoading } = useTodos()
  const store = useTimerStore()
  const reorderTodos = useReorderTodos()
  const [searchParams] = useSearchParams()
  const dateParam = searchParams.get('date')

  // Global ticker is installed in AppProviders

  // 캘린더 상태
  const [selectedDate, setSelectedDate] = useState(new Date())
  const selectedDateKey = formatDateKey(selectedDate)
  const { data: miniDaysSettings = defaultMiniDaysSettings } = useMiniDaysSettings()

  useEffect(() => {
    const nextDate = parseDateParam(dateParam)
    if (nextDate) {
      setSelectedDate(nextDate)
    }
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
    ]
  }, [miniDaysSettings])

  // Todo 액션 훅
  const actions = useTodoActions(selectedDateKey)

  // UI 상태
  const [inputDay, setInputDay] = useState<number | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const isSubmittingRef = useRef(false)
  const memoTextareaRef = useRef<HTMLTextAreaElement>(null)
  const openSectionTimeoutRef = useRef<number | null>(null)

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

  const defaultOpenId = useMemo(
    () => getDefaultMiniDayForDate(selectedDate, miniDaysSettings),
    [selectedDate, miniDaysSettings],
  )
  const [openSections, setOpenSections] = useState<Record<number, boolean>>(
    buildDefaultOpenSections(defaultOpenId),
  )

  useEffect(() => {
    setOpenSections(buildDefaultOpenSections(defaultOpenId))
  }, [defaultOpenId])

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
      const containerId = getContainerId(section.id)
      result[containerId] = (grouped[section.id] ?? []).map((t) => t.id)
    }
    return result
  }, [daySections])

  const [containerItems, setContainerItems] = useState<ContainerItems>(() =>
    buildContainerItems(buildGroupedTodos([], daySections)),
  )
  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const clonedItemsRef = useRef<ContainerItems | null>(null)
  const dragOriginContainerRef = useRef<DropContainerId | null>(null)
  const lastDragOverKeyRef = useRef<string | null>(null)
  const isAllOpen = daySections.every((section) => openSections[section.id])

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
    const miniDay = parseContainerId(containerId)
    const items: Todo[] = []
    ids.forEach((id, index) => {
      if (id === `input-${miniDay}`) return
      const base = todoById.get(id)
      if (!base) return
      items.push({
        ...base,
        miniDay,
        dayOrder: index,
      })
    })
    return items
  }

  const normalizeContainerItems = useCallback((items: ContainerItems) => {
    const next = { ...items }
    for (const [cid, ids] of Object.entries(items) as Array<[DropContainerId, string[]]>) {
      const activeIds: string[] = []
      const doneIds: string[] = []
      ids.forEach((id) => {
        const todo = todoById.get(id)
        if (todo?.isDone) {
          doneIds.push(id)
        } else {
          activeIds.push(id)
        }
      })
      next[cid] = [...activeIds, ...doneIds]
    }
    return next
  }, [todoById])

  // Keep local DnD state in sync with server data when not dragging
  useEffect(() => {
    if (activeDragId) return
    const next = buildContainerItems(groupedTodos)
    setContainerItems((prev) => (areContainerItemsEqual(prev, next) ? prev : next))
  }, [activeDragId, groupedTodos, buildContainerItems])

  useEffect(() => {
    if (activeDragId) return

    if (inputDay === null) {
      setContainerItems((prev) => {
        const next = { ...prev }
        let changed = false
        for (const section of daySections) {
          const key = getContainerId(section.id)
          const current = next[key] ?? []
          const cleaned = current.filter((id) => !id.startsWith('input-'))
          if (cleaned.length !== current.length) {
            next[key] = cleaned
            changed = true
          }
        }
        return changed ? next : prev
      })
      return
    }

    const containerId = getContainerId(inputDay)
    const activeIds = (containerItems[containerId] ?? []).filter((id) => {
      const todo = todoById.get(id)
      return !!todo && !todo.isDone
    })
    const spacerIndex = activeIds.length === 0 ? 0 : activeIds.length
    const spacerId = `input-${inputDay}`
    setContainerItems((prev) => {
      const current = prev[containerId] ?? []
      const nextItems = addSpacer(removeSpacer(current, spacerId), spacerId, spacerIndex)
      if (current.length === nextItems.length && current.every((value, index) => value === nextItems[index])) {
        return prev
      }
      return { ...prev, [containerId]: nextItems }
    })
  }, [activeDragId, containerItems, inputDay, todoById, daySections])


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
    daySections.forEach((section) => {
      totals[section.id] = 0
    })

    for (const todo of todosForSelectedDate) {
      const miniDay = todo.miniDay ?? 0
      totals[miniDay] = (totals[miniDay] ?? 0) + todo.sessionFocusSeconds
    }

    const totalAll = daySections.reduce((sum, section) => sum + (totals[section.id] ?? 0), 0)
    return { totals, totalAll }
  }, [daySections, todosForSelectedDate])

  const getTodoTimerProps = (todo: { id: string }) => {
    const timer = store.getTimer(todo.id)
    const info = getTimerInfo(timer)
    return {
      timer,
      ...info,
      sessions: timer?.sessions ?? [],
      initialFocusMs: timer?.initialFocusMs ?? 0,
    }
  }

  const handleDragStart = (event: DragStartEvent) => {
    const id = String(event.active.id)
    setActiveDragId(id)
    clonedItemsRef.current = containerItems
    dragOriginContainerRef.current = findContainerFor(id)
    lastDragOverKeyRef.current = null
  }

  const handleDragOver = (event: DragOverEvent) => {
    if (!event.over) return
    const activeId = String(event.active.id)
    if (activeId.startsWith('input-')) return
    const overId = String(event.over.id)
    const isOverContainer = overId.startsWith('day-')
    const activeRect = resolveActiveRect(event.active.rect)
    const activeTop = activeRect?.top ?? 0
    const overRect = event.over.rect
    const isBelowOverItem = !isOverContainer && activeTop > overRect.top + overRect.height / 2

    const activeContainer = findContainerFor(activeId)
    const overContainer = findContainerFor(overId)
    if (!activeContainer || !overContainer) return

    const dragOverKey = `${activeId}:${activeContainer}->${overContainer}:${overId}:${isBelowOverItem ? '1' : '0'}`
    if (lastDragOverKeyRef.current === dragOverKey) return
    lastDragOverKeyRef.current = dragOverKey

    const overMiniDay = parseContainerId(overContainer as DropContainerId)
      if (!openSections[overMiniDay]) {
        if (openSectionTimeoutRef.current) window.clearTimeout(openSectionTimeoutRef.current)
        openSectionTimeoutRef.current = window.setTimeout(() => {
          setOpenSections((prev) =>
            prev[overMiniDay] ? prev : { ...prev, [overMiniDay]: true },
          )
        }, 200)
      }

    if (activeContainer === overContainer) return

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
    if (openSectionTimeoutRef.current) {
      window.clearTimeout(openSectionTimeoutRef.current)
      openSectionTimeoutRef.current = null
    }
    if (!event.over) {
      setActiveDragId(null)
      clonedItemsRef.current = null
      dragOriginContainerRef.current = null
      lastDragOverKeyRef.current = null
      return
    }

    const activeId = String(event.active.id)
    if (activeId.startsWith('input-')) {
      setActiveDragId(null)
      clonedItemsRef.current = null
      dragOriginContainerRef.current = null
      lastDragOverKeyRef.current = null
      return
    }
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

    const normalizedSnapshot = normalizeContainerItems(snapshot)
    if (inputDay !== null) {
      const containerId = getContainerId(inputDay)
      const spacerId = `input-${inputDay}`
      const activeIds = (normalizedSnapshot[containerId] ?? []).filter((id) => {
        const todo = todoById.get(id)
        return !!todo && !todo.isDone
      })
      const spacerIndex = activeIds.length === 0 ? 0 : activeIds.length
      normalizedSnapshot[containerId] = addSpacer(
        removeSpacer(normalizedSnapshot[containerId] ?? [], spacerId),
        spacerId,
        spacerIndex,
      )
    }

    const buildReorderItemsFor = (containerId: DropContainerId): TodoReorderItem[] => {
      const ids = (normalizedSnapshot[containerId] ?? []).filter((id) => todoById.has(id))
      const miniDay = parseContainerId(containerId)
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

    setContainerItems(normalizedSnapshot)
    setActiveDragId(null)
    clonedItemsRef.current = null
    dragOriginContainerRef.current = null
    lastDragOverKeyRef.current = null
  }

  const handleDragCancel = () => {
    if (openSectionTimeoutRef.current) {
      window.clearTimeout(openSectionTimeoutRef.current)
      openSectionTimeoutRef.current = null
    }
    if (clonedItemsRef.current) {
      setContainerItems(clonedItemsRef.current)
    }
    setActiveDragId(null)
    clonedItemsRef.current = null
    dragOriginContainerRef.current = null
    lastDragOverKeyRef.current = null
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
          <button
            onClick={() => {
              if (isAllOpen) {
                setOpenSections({})
                setInputDay(null)
                return
              }
              const next: Record<number, boolean> = {}
              daySections.forEach((sectionItem) => {
                next[sectionItem.id] = true
              })
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

        {/* 로딩 */}
        {isLoading && <div className="py-8 text-center text-sm text-gray-400">불러오는 중...</div>}

        {!isLoading && (
          <DndContext
            sensors={sensors}
            collisionDetection={collisionDetectionStrategy}
            measuring={{ droppable: { strategy: MeasuringStrategy.BeforeDragging } }}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragCancel={handleDragCancel}
            onDragEnd={handleDragEnd}
          >
            <div className="space-y-6">
              {daySections.map((section, index) => {
                const sectionTodos = getTodosForContainer(getContainerId(section.id))
                const containerId = getContainerId(section.id)
                const isSectionOpen = openSections[section.id] ?? false
                const activeTodos = sectionTodos.filter((todo) => !todo.isDone)
                const doneTodos = sectionTodos.filter((todo) => todo.isDone)
                const totalCount = activeTodos.length + doneTodos.length
                const nextActiveOrder = getNextDayOrder(activeTodos)
                const nextDoneOrder = getNextDayOrder(doneTodos)
                const dayFocus = blockFocusStats.totals[section.id] ?? 0
                const shouldShowInput = inputDay === section.id
                const inputId = shouldShowInput ? `input-${section.id}` : null
                const inputAtTop = shouldShowInput && activeTodos.length === 0
                const inputBetween = shouldShowInput && activeTodos.length > 0
                const sortableIds = [
                  ...(inputAtTop && inputId ? [inputId] : []),
                  ...activeTodos.map((todo) => todo.id),
                  ...(inputBetween && inputId ? [inputId] : []),
                  ...doneTodos.map((todo) => todo.id),
                ]

                const renderInput = () => (
                  <div className="rounded-xl p-2">
                    <div className="flex items-start gap-3 rounded-lg px-2 py-1 -mx-2 -my-1">
                      <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-gray-300 bg-transparent" />
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
                        placeholder="할 일을 입력하세요"
                        autoFocus
                        onKeyDown={async (e) => {
                          if (e.key === 'Escape') {
                            reset()
                            setInputDay(null)
                            if (inputRef.current) {
                              inputRef.current.style.height = 'auto'
                            }
                            return
                          }

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
                            } catch (err) {
                              toast.error('추가 실패', { id: 'todo-create-failed' })
                              console.error(err)
                            } finally {
                              isSubmittingRef.current = false
                            }
                          } else {
                            reset()
                          }
                          setInputDay(null)
                        }}
                        className="w-full bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400 resize-none overflow-hidden min-h-[20px]"
                        rows={1}
                      />
                    </div>
                  </div>
                )

                return (
                  <section
                    key={section.id}
                    className={`${index === 0 ? '' : 'border-t border-gray-100 pt-5'} space-y-2`}
                  >
                    <ActiveSectionDrop id={containerId} className="space-y-2 pb-3">
                      {(isActiveOver) => (
                        <>
                          <div className="grid grid-cols-[20px_1fr_28px] items-start gap-2 px-2">
                            <button
                              onClick={() =>
                                setOpenSections((prev) => {
                                  return {
                                    ...prev,
                                    [section.id]: !prev[section.id],
                                  }
                                })
                              }
                              className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100"
                            >
                              <ChevronRightIcon
                                className={`h-3 w-3 transition-transform ${
                                  isSectionOpen ? 'rotate-90' : ''
                                }`}
                              />
                            </button>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-sm font-semibold text-gray-900">
                                  {section.title}
                                </h3>
                                <span className="text-xs text-gray-400">
                                  {doneTodos.length}/{totalCount}
                                </span>
                                {dayFocus > 0 && (
                                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                                    Flow · {formatTimerHoursMinutes(dayFocus)}
                                  </span>
                                )}
                              </div>
                              {section.range && <span className="text-xs text-gray-400">{section.range}</span>}
                            </div>
                            <button
                              onClick={() => {
                                setOpenSections((prev) => ({ ...prev, [section.id]: true }))
                                setInputDay((current) => (current === section.id ? null : section.id))
                                setTimeout(() => {
                                  if (inputRef.current) {
                                    inputRef.current.focus()
                                    inputRef.current.style.height = 'auto'
                                    inputRef.current.style.height = `${inputRef.current.scrollHeight}px`
                                  }
                                }, 0)
                              }}
                              className="mt-0.5 flex h-7 w-7 items-center justify-center justify-self-end rounded-full text-emerald-500 transition-colors hover:bg-emerald-50"
                            >
                              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white">
                                <PlusIcon className="h-3 w-3" />
                              </span>
                            </button>
                          </div>
                          {isSectionOpen && (
                            <>
                              <div
                                className={`min-h-[44px] space-y-1 rounded-lg py-1 transition-colors ${isActiveOver ? 'bg-emerald-50/40' : ''}`}
                              >
                                <SortableContext
                                  id={containerId}
                                  items={sortableIds}
                                  strategy={verticalListSortingStrategy}
                                >
                                  {inputAtTop && inputId && (
                                    <SortableInput id={inputId}>
                                      {renderInput()}
                                    </SortableInput>
                                  )}
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
                                      sessions,
                                      initialFocusMs,
                                    } = getTodoTimerProps(todo)

                                    return (
                                      <SortableTodoItem
                                        key={todo.id}
                                        id={todo.id}
                                        title={todo.title}
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
                                        sessions={sessions}
                                        initialFocusMs={initialFocusMs}
                                      />
                                    )
                                  })}
                                  {inputBetween && inputId && (
                                    <SortableInput id={inputId}>
                                      {renderInput()}
                                    </SortableInput>
                                  )}
                                  {doneTodos.map((todo) => {
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
                                      sessions,
                                      initialFocusMs,
                                    } = getTodoTimerProps(todo)

                                    return (
                                      <SortableTodoItem
                                        key={todo.id}
                                        id={todo.id}
                                        title={todo.title}
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
                                        sessions={sessions}
                                        initialFocusMs={initialFocusMs}
                                      />
                                    )
                                  })}
                                </SortableContext>
                              </div>
                            </>
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
        sessionCount={actions.timerTodo?.sessionCount ?? 0}
        sessionFocusSeconds={actions.timerTodo?.sessionFocusSeconds ?? 0}
        initialMode={actions.timerMode ?? undefined}
        isDone={actions.timerTodo?.isDone ?? false}
      />

      {/* 타이머 에러 메시지 (하단 중앙 floating) */}
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
