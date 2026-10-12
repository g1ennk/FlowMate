import { useEffect, useRef, useState, type RefObject } from 'react'

export const THRESHOLD = 70
export const MAX_PULL = 120
const RESISTANCE = 0.5
const SLOP = 10
// dnd-kit TouchSensor delay(160ms)보다 짧게 — 길게 누른 뒤 끄는 건 드래그 정렬로 양보한다
const LONG_PRESS_MS = 150
const MIN_SPIN_MS = 400

type Phase = 'idle' | 'pending' | 'pulling'

type Gesture = {
  phase: Phase
  startX: number
  startY: number
  startTime: number
}

const hasScrolledAncestor = (target: EventTarget | null, root: HTMLElement) => {
  let el = target instanceof Element ? target : null
  while (el && el !== root) {
    if (el.scrollTop > 0) return true
    el = el.parentElement
  }
  return false
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * standalone PWA에는 브라우저 새로고침 UI가 없어 직접 구현한다.
 * 네이티브 리스너를 쓰는 이유: React 합성 이벤트는 portal(BottomSheet, 타이머 전체화면)을 통과해 전파된다.
 */
export function usePullToRefresh(
  targetRef: RefObject<HTMLElement | null>,
  onRefresh: () => Promise<unknown>,
) {
  const [pullDistance, setPullDistance] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const onRefreshRef = useRef(onRefresh)

  useEffect(() => {
    onRefreshRef.current = onRefresh
  }, [onRefresh])

  useEffect(() => {
    const root = targetRef.current
    if (!root) return

    const gesture: Gesture = { phase: 'idle', startX: 0, startY: 0, startTime: 0 }
    let distance = 0
    let refreshing = false

    const updateDistance = (value: number) => {
      distance = value
      setPullDistance(value)
    }

    const refresh = () => {
      refreshing = true
      setIsRefreshing(true)
      updateDistance(THRESHOLD)
      // async IIFE: 동기 throw도 rejection으로 받아 allSettled가 처리하게 한다
      const task = (async () => onRefreshRef.current())()
      Promise.allSettled([task, delay(MIN_SPIN_MS)]).finally(() => {
        refreshing = false
        setIsRefreshing(false)
        updateDistance(0)
      })
    }

    const handleStart = (e: TouchEvent) => {
      gesture.phase = 'idle'
      if (refreshing || e.touches.length !== 1) return
      if (window.scrollY > 0 || hasScrolledAncestor(e.target, root)) return

      const touch = e.touches[0]
      gesture.phase = 'pending'
      gesture.startX = touch.clientX
      gesture.startY = touch.clientY
      gesture.startTime = Date.now()
    }

    const handleMove = (e: TouchEvent) => {
      if (gesture.phase === 'idle') return
      if (e.touches.length !== 1) {
        gesture.phase = 'idle'
        updateDistance(0)
        return
      }

      const touch = e.touches[0]
      const dx = touch.clientX - gesture.startX
      const dy = touch.clientY - gesture.startY

      if (gesture.phase === 'pending') {
        if (Math.hypot(dx, dy) < SLOP) return
        const isLongPress = Date.now() - gesture.startTime > LONG_PRESS_MS
        if (isLongPress || dy <= 0 || Math.abs(dx) > Math.abs(dy)) {
          gesture.phase = 'idle'
          return
        }
        gesture.phase = 'pulling'
      }

      e.preventDefault()
      updateDistance(Math.min(Math.max(dy, 0) * RESISTANCE, MAX_PULL))
    }

    const handleEnd = (e: TouchEvent) => {
      if (gesture.phase !== 'pulling') {
        gesture.phase = 'idle'
        return
      }
      gesture.phase = 'idle'
      if (e.type === 'touchend' && distance >= THRESHOLD) {
        refresh()
      } else {
        updateDistance(0)
      }
    }

    root.addEventListener('touchstart', handleStart, { passive: true })
    root.addEventListener('touchmove', handleMove, { passive: false })
    root.addEventListener('touchend', handleEnd)
    root.addEventListener('touchcancel', handleEnd)
    return () => {
      root.removeEventListener('touchstart', handleStart)
      root.removeEventListener('touchmove', handleMove)
      root.removeEventListener('touchend', handleEnd)
      root.removeEventListener('touchcancel', handleEnd)
    }
  }, [targetRef])

  return { pullDistance, isRefreshing }
}
