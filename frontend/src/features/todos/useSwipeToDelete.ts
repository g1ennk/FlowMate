import { useCallback, useEffect, useRef, useState, type MouseEvent, type PointerEvent, type TouchEvent } from 'react'

// 할 일 행을 왼쪽으로 밀어 지우는 손짓(사용자 결정 2026-10-21, iOS 목록의 trailing 스와이프에서 full swipe를 뺀 모양).
// 살짝 밀면 오른쪽에 빨간 "삭제"가 드러나 머물고(REVEAL_WIDTH), 그 버튼을 눌러야 지운다. 끝까지 밀어 바로 지우는 동작은 없다.
// 밀리는 거리는 REVEAL_WIDTH로 고정이다(더 밀어도 따라오지 않는다, 사용자 결정 2026-10-21). 지운 뒤에는 되돌리기 토스트로 되살린다.
// 손짓은 세 가지다. 터치, 마우스로 왼쪽으로 끌기, 트랙패드 두 손가락 가로 밀기(데스크톱도 같은 동작, 사용자 결정 2026-10-21).
// 터치와 마우스는 처음 8px을 움직인 방향이 가로일 때만 민다. 세로는 스크롤과 길게 눌러/세로로 끌어 순서 바꾸기(dnd-kit)에 남긴다.
// 키보드와 스크린리더는 메뉴 시트의 "삭제"를 쓴다. 한 번에 한 행만 열어 둔다. 다른 행을 밀거나 행 밖을 누르면 열린 행은 닫힌다.

// 내용이 밀리는 거리. 삭제 버튼(DELETE_BUTTON_WIDTH)과 내용 사이에 8을 띄운다
export const REVEAL_WIDTH = 80
export const DELETE_BUTTON_WIDTH = 72
const AXIS_LOCK_PX = 8
// 트랙패드 가로 밀기는 끝 이벤트가 없어서, 이만큼 wheel이 멈추면 손을 뗀 것으로 본다
const WHEEL_END_MS = 140

// 지금 열려 있는 행을 닫는 함수(앱 전체에서 하나)
let closeOpenRow: (() => void) | null = null

type Options = {
  enabled: boolean
  onDelete: () => void
}

type Gesture = { x: number; y: number; base: number; axis: 'x' | 'y' | null }

export function useSwipeToDelete({ enabled, onDelete }: Options) {
  const [offset, setOffsetState] = useState(0)
  const [isSwiping, setIsSwiping] = useState(false)
  const rowRef = useRef<HTMLDivElement | null>(null)
  // 창에 단 마우스, wheel 리스너가 최신 값을 읽도록 offset을 ref로도 들고 있는다
  const offsetRef = useRef(0)
  const gesture = useRef<Gesture | null>(null)
  const wheelTimer = useRef<number | null>(null)
  // 민 직후 손을 떼며 생기는 click이 행 안 버튼을 누르지 않게 한 번 막는다
  const suppressClick = useRef(false)
  const onDeleteRef = useRef(onDelete)
  const enabledRef = useRef(enabled)
  useEffect(() => {
    onDeleteRef.current = onDelete
    enabledRef.current = enabled
  })

  const setOffset = useCallback((value: number) => {
    offsetRef.current = value
    setOffsetState(value)
  }, [])
  const close = useCallback(() => setOffset(0), [setOffset])
  // 렌더 중에 state만 바꾼 경우(꺼질 때 닫기)에도 ref를 맞춘다
  useEffect(() => { offsetRef.current = offset }, [offset])

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
  if (!enabled && offset !== 0) setOffsetState(0)
  if (!enabled && isSwiping) setIsSwiping(false)

  useEffect(() => () => {
    if (closeOpenRow === close) closeOpenRow = null
    if (wheelTimer.current !== null) window.clearTimeout(wheelTimer.current)
  }, [close])

  const begin = (x: number, y: number) => {
    gesture.current = { x, y, base: offsetRef.current, axis: null }
    suppressClick.current = false
  }

  const lockX = () => {
    const g = gesture.current
    if (!g) return
    g.axis = 'x'
    // 다른 행이 열려 있으면 닫는다
    if (closeOpenRow && closeOpenRow !== close) closeOpenRow()
    closeOpenRow = close
    setIsSwiping(true)
  }

  const moveTo = (dx: number) => {
    const g = gesture.current
    if (!g) return
    suppressClick.current = true
    setOffset(Math.max(-REVEAL_WIDTH, Math.min(0, g.base + dx)))
  }

  // x, y는 시작점 기준이 아닌 화면 좌표다
  const move = (x: number, y: number) => {
    const g = gesture.current
    if (!enabledRef.current || !g) return
    const dx = x - g.x
    const dy = y - g.y
    if (g.axis === null) {
      if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return
      if (Math.abs(dx) > Math.abs(dy)) lockX()
      else g.axis = 'y'
    }
    if (g.axis === 'x') moveTo(dx)
  }

  const finish = () => {
    const g = gesture.current
    gesture.current = null
    if (!g || g.axis !== 'x') return
    setIsSwiping(false)
    const current = -offsetRef.current
    if (current > REVEAL_WIDTH / 2) setOffset(-REVEAL_WIDTH)
    else close()
  }

  const onTouchStart = (event: TouchEvent) => {
    if (!enabled || event.touches.length !== 1) return
    begin(event.touches[0].clientX, event.touches[0].clientY)
  }
  const onTouchMove = (event: TouchEvent) => move(event.touches[0].clientX, event.touches[0].clientY)

  // 마우스: 왼쪽 버튼을 누른 채 끈다. 행 밖으로 나가도 이어지도록 창에서 받는다
  const onPointerDown = (event: PointerEvent) => {
    if (!enabled || event.pointerType !== 'mouse' || event.button !== 0) return
    begin(event.clientX, event.clientY)
    const handleMove = (e: globalThis.PointerEvent) => move(e.clientX, e.clientY)
    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      window.removeEventListener('pointercancel', handleUp)
      finish()
    }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    window.addEventListener('pointercancel', handleUp)
  }

  // 트랙패드 두 손가락 가로 밀기. 가로가 세로보다 클 때만 받고, 그때는 브라우저 앞으로/뒤로 가기 손짓이 되지 않게 막는다.
  // React의 wheel은 passive라 막을 수 없어 직접 단다
  useEffect(() => {
    const el = rowRef.current
    if (!el) return
    const handleWheel = (event: WheelEvent) => {
      if (!enabledRef.current) return
      const g = gesture.current
      if (!g && Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return
      event.preventDefault()
      if (!g) {
        begin(0, 0)
        lockX()
      }
      const active = gesture.current
      if (!active) return
      // 두 손가락을 왼쪽으로 밀면 deltaX가 양수다. 내용도 왼쪽(음수)으로 간다
      active.x -= event.deltaX
      moveTo(active.x)
      if (wheelTimer.current !== null) window.clearTimeout(wheelTimer.current)
      wheelTimer.current = window.setTimeout(() => {
        wheelTimer.current = null
        finish()
      }, WHEEL_END_MS)
    }
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  })

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
    handlers: { onTouchStart, onTouchMove, onTouchEnd: finish, onTouchCancel: finish, onPointerDown },
    onClickCapture,
    handleDelete,
  }
}
