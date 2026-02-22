import { Fragment, useMemo, useRef, useState, useEffect, useCallback, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { toast } from 'react-hot-toast'
import { z } from 'zod'
import {
  DndContext,
  closestCenter,
  pointerWithin,
  type CollisionDetection,
  KeyboardSensor,
  MouseSensor,
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
type CrossSectionPreview = {
  containerId: DropContainerId
  activeInsertIndex: number
} | null
type QueuedCrossContainerMove = {
  activeId: string
  activeContainer: DropContainerId
  overContainer: DropContainerId
  overId: string
  isOverContainer: boolean
  isBelowOverItem: boolean
} | null

type RectLike = { top: number; height: number }
type DaySectionMeta = { id: number; title: string; range: string }

type SectionGuideContent = {
  headline: string
  description: string
  ctaLabel: string
  examples: readonly string[]
}

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

const getSectionGuideContent = (
  section: Pick<DaySectionMeta, 'id' | 'title'>,
  mode: 'empty' | 'doneOnly',
): SectionGuideContent => {
  const title = section.title.trim() || '이 섹션'
  const emptyBySection: Record<number, Omit<SectionGuideContent, 'ctaLabel'>> = {
    0: {
      headline: '개인 리듬에 맞춰 먼저 담아둘까요?',
      description: '집중 시간대는 사람마다 달라요. 애매하면 미분류에 먼저 적고 나중에 옮겨도 됩니다.',
      examples: ['갑자기 떠오른 할 일 기록', '나중에 처리할 일 모아두기', '아이디어 메모'],
    },
    1: {
      headline: `${title}에는 집중 작업(Deep Work)부터`,
      description: '집중력이 필요한 기획, 문서 작성, 문제 해결 작업을 먼저 배치해보세요.',
      examples: ['핵심 기획안 작성', '문제 해결/디버깅 집중', '중요 문서 초안 작성'],
    },
    2: {
      headline: `${title}에는 소통·처리 업무를 모아볼까요?`,
      description: '회신, 회의, 반복 처리처럼 전환이 잦은 일을 묶어두면 부담이 줄어듭니다.',
      examples: ['이메일/메시지 답장', '회의 후속 작업 처리', '반복 업무/서류 정리'],
    },
    3: {
      headline: `${title}에는 창의·마무리 작업이 잘 맞아요`,
      description: '정리, 회고, 개인 프로젝트처럼 몰입하거나 마무리하기 좋은 작업을 배치해보세요.',
      examples: ['개인 프로젝트 진행', '오늘 작업 정리/회고', '내일 준비 및 체크리스트'],
    },
  }

  const doneOnlyBySection: Record<number, Omit<SectionGuideContent, 'ctaLabel'>> = {
    0: {
      headline: '잘 정리했어요. 다음 아이템을 담아둘까요?',
      description: '시간대가 애매하면 미분류에 먼저 적고 나중에 옮겨도 됩니다.',
      examples: ['다음에 떠오를 일 기록', '짧은 할 일 추가', '보류할 일 메모'],
    },
    1: {
      headline: `${title} 집중 작업을 잘 끝냈어요`,
      description: '집중력이 남아 있다면 중요한 작업 1개만 더 이어가도 좋아요.',
      examples: ['다음 핵심 작업 시작', '중요 문서 작성 계속', '집중 검토 이어가기'],
    },
    2: {
      headline: `${title} 처리/소통 업무를 이어가볼까요?`,
      description: '비슷한 성격의 처리 업무를 묶어두면 전환 비용을 줄이기 좋아요.',
      examples: ['답장할 메시지 정리', '후속 작업 등록', '검토 요청 처리'],
    },
    3: {
      headline: `${title}에 창의/마무리 작업을 하나 더 넣어볼까요?`,
      description: '창의 작업이나 정리/회고처럼 가벼운 마감 작업을 넣어보세요.',
      examples: ['아이디어 정리/브레인스토밍', '내일 일정 확인', '간단 회고 작성'],
    },
  }

  const source = mode === 'empty'
    ? (emptyBySection[section.id] ?? emptyBySection[0])
    : (doneOnlyBySection[section.id] ?? doneOnlyBySection[0])
  return {
    ...source,
    ctaLabel: mode === 'empty' ? `${title}에 추가` : '다음 할 일 추가',
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

function SectionGuideCard({
  content,
  onAdd,
  onSelectExample,
}: {
  content: SectionGuideContent
  onAdd: () => void
  onSelectExample: (title: string) => void
}) {
  const visibleExamples = content.examples.slice(0, 2)

  return (
    <div
      className="mx-2 mb-2 rounded-2xl border border-gray-100 bg-gradient-to-b from-gray-50 to-white px-3 py-2.5 transition-colors"
    >
      <p className="text-sm font-semibold text-gray-900">{content.headline}</p>
      <p className="mt-1 text-xs leading-4 text-gray-500">{content.description}</p>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex h-7 items-center gap-1.5 rounded-full bg-emerald-500 px-3 text-xs font-semibold text-white transition-colors hover:bg-emerald-600"
        >
          <PlusIcon className="h-3 w-3" />
          <span>{content.ctaLabel}</span>
        </button>
        {visibleExamples.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => onSelectExample(example)}
            className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 transition-colors hover:border-emerald-200 hover:text-emerald-700"
          >
            {example}
          </button>
        ))}
      </div>
    </div>
  )
}

function CrossSectionPreviewSlot() {
  return (
    <div className="pointer-events-none mx-2 my-1">
      <div className="h-11 rounded-xl border-2 border-emerald-300/85 bg-transparent" />
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
  const todayDateKey = formatDateKey(new Date())
  const isSelectedDateToday = selectedDateKey === todayDateKey
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
    ] satisfies DaySectionMeta[]
  }, [miniDaysSettings])

  // Todo 액션 훅
  const actions = useTodoActions(selectedDateKey)

  // UI 상태
  const [inputDay, setInputDay] = useState<number | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const isSubmittingRef = useRef(false)
  const memoTextareaRef = useRef<HTMLTextAreaElement>(null)
  const openSectionTimeoutRef = useRef<number | null>(null)
  const pendingOpenSectionIdRef = useRef<number | null>(null)

  // 폼
  const {
    register,
    reset,
    getValues,
    setValue,
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
  const [crossSectionPreview, setCrossSectionPreview] = useState<CrossSectionPreview>(null)
  const crossContainerMoveRafRef = useRef<number | null>(null)
  const queuedCrossContainerMoveRef = useRef<QueuedCrossContainerMove>(null)
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

  // 타이머 상태
  // === Effects ===
  // 메모 편집 모드로 전환 시 자동 포커스
  useEffect(() => {
    if (actions.noteEditMode && memoTextareaRef.current) {
      memoTextareaRef.current.focus()
      // 커서를 텍스트 끝으로 이동
      const length = memoTextareaRef.current.value.length
      memoTextareaRef.current.setSelectionRange(length, length)
    }
  }, [actions.noteEditMode])

  // === 핸들러 ===

  // DnD
  const sensors = useSensors(
    // Mouse/Touh 센서를 분리해 모바일에서 PointerSensor가 TouchSensor를 가로채지 않게 한다.
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 160, tolerance: 12 } }),
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

  const resizeTodoInput = (node: HTMLTextAreaElement | null) => {
    if (!node) return
    node.style.height = 'auto'
    node.style.height = `${node.scrollHeight}px`
  }

  const focusTodoInputSoon = () => {
    window.setTimeout(() => {
      if (!inputRef.current) return
      inputRef.current.focus()
      const length = inputRef.current.value.length
      inputRef.current.setSelectionRange(length, length)
      resizeTodoInput(inputRef.current)
    }, 0)
  }

  const openQuickInputForSection = (sectionId: number, presetTitle?: string) => {
    setOpenSections((prev) => ({ ...prev, [sectionId]: true }))
    setInputDay(sectionId)
    if (presetTitle !== undefined) {
      setValue('title', presetTitle, { shouldDirty: true })
    } else {
      reset({ title: '' })
    }
    focusTodoInputSoon()
  }

  const cancelQueuedCrossContainerMove = useCallback(() => {
    queuedCrossContainerMoveRef.current = null
    if (crossContainerMoveRafRef.current !== null) {
      window.cancelAnimationFrame(crossContainerMoveRafRef.current)
      crossContainerMoveRafRef.current = null
    }
  }, [])

  const cancelPendingOpenSection = useCallback(() => {
    pendingOpenSectionIdRef.current = null
    if (openSectionTimeoutRef.current !== null) {
      window.clearTimeout(openSectionTimeoutRef.current)
      openSectionTimeoutRef.current = null
    }
  }, [])

  const scheduleCrossContainerMove = useCallback((move: Exclude<QueuedCrossContainerMove, null>) => {
    queuedCrossContainerMoveRef.current = move
    if (crossContainerMoveRafRef.current !== null) return

    crossContainerMoveRafRef.current = window.requestAnimationFrame(() => {
      crossContainerMoveRafRef.current = null
      const pending = queuedCrossContainerMoveRef.current
      if (!pending) return

      setContainerItems((prev) => {
        const next = { ...prev }
        const fromItems = [...(next[pending.activeContainer] ?? [])]
        const toItems = [...(next[pending.overContainer] ?? [])]

        const fromIndex = fromItems.indexOf(pending.activeId)
        if (fromIndex === -1) return prev

        fromItems.splice(fromIndex, 1)

        const overIndex = pending.isOverContainer ? toItems.length : toItems.indexOf(pending.overId)
        if (!pending.isOverContainer && overIndex === -1) return prev

        const insertIndex = pending.isOverContainer
          ? toItems.length
          : overIndex + (pending.isBelowOverItem ? 1 : 0)
        toItems.splice(Math.max(0, Math.min(insertIndex, toItems.length)), 0, pending.activeId)

        const prevFrom = prev[pending.activeContainer] ?? []
        const prevTo = prev[pending.overContainer] ?? []
        const fromUnchanged =
          prevFrom.length === fromItems.length &&
          prevFrom.every((value, index) => value === fromItems[index])
        const toUnchanged =
          prevTo.length === toItems.length &&
          prevTo.every((value, index) => value === toItems[index])

        if (fromUnchanged && toUnchanged) return prev

        next[pending.activeContainer] = fromItems
        next[pending.overContainer] = toItems
        return next
      })
    })
  }, [])

  const clearDragTransientState = useCallback(() => {
    setActiveDragId(null)
    setCrossSectionPreview(null)
    cancelQueuedCrossContainerMove()
    cancelPendingOpenSection()
    clonedItemsRef.current = null
    dragOriginContainerRef.current = null
    lastDragOverKeyRef.current = null
  }, [cancelPendingOpenSection, cancelQueuedCrossContainerMove])

  useEffect(() => {
    return () => {
      if (openSectionTimeoutRef.current !== null) {
        window.clearTimeout(openSectionTimeoutRef.current)
        openSectionTimeoutRef.current = null
      }
      if (crossContainerMoveRafRef.current !== null) {
        window.cancelAnimationFrame(crossContainerMoveRafRef.current)
        crossContainerMoveRafRef.current = null
      }
    }
  }, [])

  const handleDragStart = (event: DragStartEvent) => {
    const id = String(event.active.id)
    setActiveDragId(id)
    setCrossSectionPreview(null)
    clonedItemsRef.current = containerItems
    dragOriginContainerRef.current = findContainerFor(id)
    lastDragOverKeyRef.current = null
  }

  const handleDragOver = (event: DragOverEvent) => {
    if (!event.over) {
      cancelPendingOpenSection()
      cancelQueuedCrossContainerMove()
      lastDragOverKeyRef.current = null
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
      cancelPendingOpenSection()
      cancelQueuedCrossContainerMove()
      lastDragOverKeyRef.current = null
      return
    }

    const dragOverKey = `${activeId}:${activeContainer}->${overContainer}:${overId}:${isBelowOverItem ? '1' : '0'}`
    if (lastDragOverKeyRef.current === dragOverKey) return
    lastDragOverKeyRef.current = dragOverKey

    if (activeContainer === overContainer) {
      cancelPendingOpenSection()
      cancelQueuedCrossContainerMove()
      return
    }

    // 닫힌 섹션으로 교차 이동하는 동안에는 "펼침"만 먼저 처리하고,
    // 펼쳐진 이후에 실시간 배열 이동을 시작해 측정 루프 위험을 낮춘다.
    if (isOverContainer) {
      const overSectionId = parseContainerId(overContainer)
      const isOverSectionOpen = openSections[overSectionId] ?? false
      if (!isOverSectionOpen) {
        cancelQueuedCrossContainerMove()
        if (pendingOpenSectionIdRef.current !== overSectionId) {
          cancelPendingOpenSection()
          pendingOpenSectionIdRef.current = overSectionId
          openSectionTimeoutRef.current = window.setTimeout(() => {
            openSectionTimeoutRef.current = null
            pendingOpenSectionIdRef.current = null
            setOpenSections((prev) => {
              if (prev[overSectionId]) return prev
              return { ...prev, [overSectionId]: true }
            })
          }, 140)
        }
        return
      }
    }

    cancelPendingOpenSection()

    // 교차 섹션에서는 실시간 배열 이동을 유지하되 rAF 1프레임당 1회로 제한한다.
    scheduleCrossContainerMove({
      activeId,
      activeContainer,
      overContainer,
      overId,
      isOverContainer,
      isBelowOverItem,
    })
  }

  const handleDragEnd = (event: DragEndEvent) => {
    if (openSectionTimeoutRef.current) {
      window.clearTimeout(openSectionTimeoutRef.current)
      openSectionTimeoutRef.current = null
    }
    if (!event.over) {
      clearDragTransientState()
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
    const dragOriginContainer = dragOriginContainerRef.current
    if (!activeContainer || !overContainer) {
      clearDragTransientState()
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
    if (dragOriginContainer) affected.add(dragOriginContainer)

    const reorderItems = Array.from(affected).flatMap(buildReorderItemsFor)
    if (reorderItems.length > 0) {
      reorderTodos.mutate({ items: reorderItems })
    }

    setContainerItems(normalizedSnapshot)
    clearDragTransientState()
  }

  const handleDragCancel = () => {
    if (openSectionTimeoutRef.current) {
      window.clearTimeout(openSectionTimeoutRef.current)
      openSectionTimeoutRef.current = null
    }
    if (clonedItemsRef.current) {
      setContainerItems(clonedItemsRef.current)
    }
    clearDragTransientState()
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
                const isCurrentTimeSection = isSelectedDateToday && section.id === defaultOpenId
                const shouldShowInput = inputDay === section.id
                const isEmptySection = totalCount === 0
                const isDoneOnlySection = activeTodos.length === 0 && doneTodos.length > 0
                const shouldShowPriorityGuide = isCurrentTimeSection || section.id === 0
                const inputAtTop = shouldShowInput && activeTodos.length === 0
                const inputBetween = shouldShowInput && activeTodos.length > 0
                const hasRangeMeta = section.range.trim().length > 0
                const hasFlowMeta = dayFocus > 0
                const showRangeOnMobile = hasRangeMeta && (!isSectionOpen || !hasFlowMeta)
                const showFlowOnMobile = hasFlowMeta && (isSectionOpen || !hasRangeMeta)
                const previewActiveInsertIndex = crossSectionPreview?.containerId === containerId
                  ? Math.max(0, Math.min(crossSectionPreview.activeInsertIndex, activeTodos.length))
                  : null
                const sortableIds = [
                  ...activeTodos.map((todo) => todo.id),
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
                            resizeTodoInput(e)
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
                                focusTodoInputSoon()
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
                          resizeTodoInput(e.target)
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
                      {() => (
                        <>
                          <div className="grid grid-cols-[20px_minmax(0,1fr)_auto] items-start gap-2 rounded-xl px-2 py-1">
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
                                const willOpenInput = inputDay !== section.id
                                setOpenSections((prev) => ({ ...prev, [section.id]: true }))
                                setInputDay((current) => (current === section.id ? null : section.id))
                                if (willOpenInput) focusTodoInputSoon()
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
                            <>
                              <div
                                className="min-h-[44px] space-y-1 rounded-lg py-1"
                              >
                                {!shouldShowInput && (isEmptySection || isDoneOnlySection) && shouldShowPriorityGuide && (
                                  <SectionGuideCard
                                    content={getSectionGuideContent(section, isEmptySection ? 'empty' : 'doneOnly')}
                                    onAdd={() => openQuickInputForSection(section.id)}
                                    onSelectExample={(title) => openQuickInputForSection(section.id, title)}
                                  />
                                )}
                                <SortableContext
                                  id={containerId}
                                  items={sortableIds}
                                  strategy={verticalListSortingStrategy}
                                >
                                  {inputAtTop && renderInput()}
                                  {previewActiveInsertIndex === 0 && activeTodos.length === 0 && (
                                    <CrossSectionPreviewSlot />
                                  )}
                                  {activeTodos.map((todo, activeIndex) => {
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
                                      <Fragment key={todo.id}>
                                        {previewActiveInsertIndex === activeIndex && <CrossSectionPreviewSlot />}
                                        <SortableTodoItem
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
                                      </Fragment>
                                    )
                                  })}
                                  {previewActiveInsertIndex === activeTodos.length && activeTodos.length > 0 && (
                                    <CrossSectionPreviewSlot />
                                  )}
                                  {inputBetween && renderInput()}
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

            const stopwatchDisabledReason = isCompleted
              ? '완료된 태스크는 타이머를 시작할 수 없어요'
              : otherRunningTimer
                ? '다른 태스크 타이머가 실행 중이에요'
                : currentTimerRunning && currentTimer.mode === 'pomodoro'
                  ? '같은 태스크의 뽀모도로가 실행 중이에요'
                  : null

            const pomodoroDisabledReason = isCompleted
              ? '완료된 태스크는 타이머를 시작할 수 없어요'
              : otherRunningTimer
                ? '다른 태스크 타이머가 실행 중이에요'
                : currentTimerRunning && currentTimer.mode === 'stopwatch'
                  ? '같은 태스크의 일반 타이머가 실행 중이에요'
                  : null

            return (
              <>
                {/* 일반 타이머 */}
                <div>
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
                  {stopwatchDisabledReason && (
                    <p className="px-4 pb-2 text-xs text-gray-400">
                      {stopwatchDisabledReason}
                    </p>
                  )}
                </div>

                {/* 뽀모도로 타이머 */}
                <div>
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
                  {pomodoroDisabledReason && (
                    <p className="px-4 pb-2 text-xs text-gray-400">
                      {pomodoroDisabledReason}
                    </p>
                  )}
                </div>
              </>
            )
          })()}
        </div>
      </BottomSheet>

      {/* 메모 바텀시트 */}
      <BottomSheet
        isOpen={actions.showNoteModal}
        onClose={actions.handleCloseNote}
        panelClassName="min-h-[50dvh]"
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
          onPointerDown={!actions.noteEditMode ? (e) => {
            // Mobile browsers often ignore async focus after a tap on a readOnly textarea.
            // Flip to editable + focus within the same user gesture so the keyboard opens.
            const target = e.currentTarget
            e.preventDefault()
            actions.handleEditNote()
            target.readOnly = false
            target.focus()
            const length = target.value.length
            target.setSelectionRange(length, length)
          } : undefined}
          readOnly={!actions.noteEditMode}
          placeholder="메모를 입력하세요..."
          className={`mb-2 h-40 w-full resize-none rounded-xl bg-yellow-50 border border-yellow-200 p-3 text-sm text-gray-900 outline-none placeholder:text-gray-400 ${
            !actions.noteEditMode ? 'cursor-pointer' : ''
          }`}
        />
        {!actions.noteEditMode && (
          <p className="mb-4 px-1 text-xs text-gray-400">
            탭하면 바로 편집 모드로 전환됩니다
          </p>
        )}
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
