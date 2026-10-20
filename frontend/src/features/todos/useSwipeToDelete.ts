import { useCallback, useEffect, useRef, useState, type MouseEvent, type TouchEvent } from 'react'

// 할 일 행을 왼쪽으로 밀어 지우는 손짓(사용자 결정 2026-10-21, iOS 기본 앱 방식).
// 조금 밀면 오른쪽에 빨간 "삭제"가 드러나 머물고(REVEAL_WIDTH), 행 폭의 절반을 넘겨 밀고 놓으면 바로 지운다.
// 터치에서만 쓴다. 마우스와 키보드, 스크린리더는 메뉴 시트의 "삭제"를 쓴다.
// 세로 스크롤과 길게 눌러 끌기(dnd-kit TouchSensor: 250ms, 8px)와 겹치지 않게, 처음 8px을 움직인 방향이 가로일 때만 민다.
// 한 번에 한 행만 열어 둔다. 다른 행을 밀거나 행 밖을 누르면 열린 행은 닫힌다.

export const REVEAL_WIDTH = 72
const AXIS_LOCK_PX = 8
const FULL_SWIPE_RATIO = 0.5

// 지금 열려 있는 행을 닫는 함수(앱 전체에서 하나)
let closeOpenRow: (() => void) | null = null

type Options = {
  enabled: boolean
  onDelete: () => void
}

export function useSwipeToDelete({ enabled, onDelete }: Options) {
  const [offset, setOffset] = useState(0)
  const [isSwiping, setIsSwiping] = useState(false)
  const rowRef = useRef<HTMLDivElement | null>(null)
  const start = useRef<{ x: number; y: number; base: number; width: number } | null>(null)
  const axis = useRef<'x' | 'y' | null>(null)
  // 민 직후 손을 떼며 생기는 click이 행 안 버튼을 누르지 않게 한 번 막는다
  const suppressClick = useRef(false)
  const onDeleteRef = useRef(onDelete)
  useEffect(() => { onDeleteRef.current = onDelete })

  const close = useCallback(() => setOffset(0), [])

  const isOpen = offset < 0

  // 닫히면 열린 행 자리를 비운다
  useEffect(() => {
    if (offset === 0 && closeOpenRow === close) closeOpenRow = null
  }, [offset, close])

  // 열린 동안 행 밖을 누르면 닫는다
  useEffect(() => {
    if (!isOpen || isSwiping) return
    const handle = (event: Event) => {
      if (rowRef.current && event.target instanceof Node && rowRef.current.contains(event.target)) return
      close()
    }
    document.addEventListener('touchstart', handle, { passive: true })
    document.addEventListener('mousedown', handle)
    return () => {
      document.removeEventListener('touchstart', handle)
      document.removeEventListener('mousedown', handle)
    }
  }, [isOpen, isSwiping, close])

  // 편집, 선택 모드, 끌기가 시작되면 닫는다(렌더 중 prop 변화에 맞춰 state 조정)
  if (!enabled && offset !== 0) setOffset(0)
  if (!enabled && isSwiping) setIsSwiping(false)

  useEffect(() => () => {
    if (closeOpenRow === close) closeOpenRow = null
  }, [close])

  const onTouchStart = (event: TouchEvent) => {
    if (!enabled || event.touches.length !== 1) return
    const touch = event.touches[0]
    start.current = { x: touch.clientX, y: touch.clientY, base: offset, width: rowRef.current?.offsetWidth ?? 0 }
    axis.current = null
    suppressClick.current = false
  }

  const onTouchMove = (event: TouchEvent) => {
    const s = start.current
    if (!enabled || !s) return
    const touch = event.touches[0]
    const dx = touch.clientX - s.x
    const dy = touch.clientY - s.y
    if (axis.current === null) {
      if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return
      axis.current = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
      if (axis.current === 'x') {
        // 다른 행이 열려 있으면 닫는다
        if (closeOpenRow && closeOpenRow !== close) closeOpenRow()
        closeOpenRow = close
        setIsSwiping(true)
      }
    }
    if (axis.current !== 'x') return
    suppressClick.current = true
    setOffset(Math.max(-s.width, Math.min(0, s.base + dx)))
  }

  const onTouchEnd = () => {
    const s = start.current
    start.current = null
    if (!s || axis.current !== 'x') return
    axis.current = null
    setIsSwiping(false)
    if (s.width > 0 && -offset > s.width * FULL_SWIPE_RATIO) {
      close()
      onDeleteRef.current()
      return
    }
    if (-offset > REVEAL_WIDTH / 2) setOffset(-REVEAL_WIDTH)
    else close()
  }

  // 민 직후의 click은 버리고, 열린 행의 내용을 누르면 그 동작 대신 닫기만 한다
  const onClickCapture = (event: MouseEvent) => {
    if (!suppressClick.current && !isOpen) return
    event.preventDefault()
    event.stopPropagation()
    if (suppressClick.current) suppressClick.current = false
    else close()
  }

  const handleDelete = () => {
    close()
    onDeleteRef.current()
  }

  return {
    rowRef,
    offset,
    isSwiping,
    isOpen,
    // 손짓은 행 전체(삭제 버튼 포함)에서 받고, click 가로채기는 밀리는 내용에만 단다(삭제 버튼 click은 막지 않는다)
    handlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: onTouchEnd },
    onClickCapture,
    handleDelete,
  }
}
