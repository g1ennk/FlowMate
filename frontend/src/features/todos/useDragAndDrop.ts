import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import {
  closestCenter,
  pointerWithin,
  type CollisionDetection,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type DragOverEvent,
} from '@dnd-kit/core'
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import type { Todo, TodoReorderItem } from '../../api/types'
import type { DaySectionMeta } from './todosPageHelpers'

export type DropContainerId = `day-${number}`
export type ContainerItems = Record<DropContainerId, string[]>
export type CrossSectionPreview = {
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

const resolveActiveRect = (rect: unknown): RectLike | null => {
  const raw = (rect as { current?: unknown })?.current ?? rect
  const candidate = (raw as { translated?: unknown; initial?: unknown })?.translated ??
    (raw as { translated?: unknown; initial?: unknown })?.initial ??
    raw
  if (!candidate || typeof candidate !== 'object') {
    return null
  }
  const maybeRect = candidate as Partial<Record<keyof RectLike, unknown>>
  if (typeof maybeRect.top !== 'number' || typeof maybeRect.height !== 'number') {
    return null
  }
  return maybeRect as RectLike
}

export const getContainerId = (miniDay: number): DropContainerId => `day-${miniDay}`

export const parseContainerId = (id: DropContainerId) => {
  const parts = id.split('-')
  const parsedMiniDay = Number(parts[1])
  return Number.isNaN(parsedMiniDay) ? 0 : parsedMiniDay
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

type UseDragAndDropParams = {
  daySections: DaySectionMeta[]
  groupedTodos: Record<number, Todo[]>
  todosForSelectedDate: Todo[]
  openSections: Record<number, boolean>
  setOpenSections: React.Dispatch<React.SetStateAction<Record<number, boolean>>>
  reorderTodosMutate: (payload: { items: TodoReorderItem[] }) => void
}

export function useDragAndDrop({
  daySections,
  groupedTodos,
  todosForSelectedDate,
  openSections,
  setOpenSections,
  reorderTodosMutate,
}: UseDragAndDropParams) {
  const buildContainerItems = useCallback((grouped: Record<number, Todo[]>): ContainerItems => {
    const result = {} as ContainerItems
    for (const section of daySections) {
      const containerId = getContainerId(section.id)
      result[containerId] = (grouped[section.id] ?? []).map((t) => t.id)
    }
    return result
  }, [daySections])

  const [containerItems, setContainerItems] = useState<ContainerItems>(() =>
    buildContainerItems(Object.fromEntries(daySections.map((s) => [s.id, []])) as Record<number, Todo[]>),
  )
  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const [crossSectionPreview, setCrossSectionPreview] = useState<CrossSectionPreview>(null)
  const crossContainerMoveRafRef = useRef<number | null>(null)
  const queuedCrossContainerMoveRef = useRef<QueuedCrossContainerMove>(null)
  const clonedItemsRef = useRef<ContainerItems | null>(null)
  const dragOriginContainerRef = useRef<DropContainerId | null>(null)
  const lastDragOverKeyRef = useRef<string | null>(null)
  const openSectionTimeoutRef = useRef<number | null>(null)
  const pendingOpenSectionIdRef = useRef<number | null>(null)

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

  const getTodosForContainer = useCallback((containerId: DropContainerId): Todo[] => {
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
  }, [containerItems, todoById])

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

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 160, tolerance: 12 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

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

    // eslint-disable-next-line react-hooks/immutability -- read-only snapshot, not mutating state
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
      reorderTodosMutate({ items: reorderItems })
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

  return {
    sensors,
    collisionDetectionStrategy,
    activeDragId,
    containerItems,
    crossSectionPreview,
    getTodosForContainer,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleDragCancel,
  }
}
