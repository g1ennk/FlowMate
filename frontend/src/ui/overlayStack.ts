import { useEffect, useLayoutEffect, useRef, useSyncExternalStore, type RefObject } from 'react'

// 열린 오버레이(바텀 시트, 확인 시트, 타이머 풀스크린)를 연 순서대로 쌓아 두는 작은 스택.
// - Escape는 맨 위 레이어만 받는다(겹친 시트가 한꺼번에 닫히지 않게).
// - body 스크롤 잠금은 첫 레이어가 열릴 때 걸고 마지막 레이어가 닫힐 때 푼다.
// - 레이어가 하나라도 열려 있으면 앱 화면(OverlayInertRoot)을 inert로 두고, 겹쳤을 때는 아래 레이어도 inert로 둔다.
//   inert는 React 렌더를 기다리지 않고 여기서 바로 바꾼다. 닫힐 때 inert를 먼저 풀어야 연 자리로 포커스를 돌려줄 수 있다.
// - 토스트는 useOverlayOpen으로 위치를 정한다(열린 레이어가 있으면 화면 위).

type Layer = {
  id: number
  onEscape: () => void
  elementRef?: RefObject<HTMLElement | null>
  // 레이어를 열 때 포커스가 있던 곳. 닫을 때 돌려준다
  opener: HTMLElement | null
}

let layers: Layer[] = []
let nextId = 1
// 닫힌 레이어가 커밋 뒤로 미뤄 둔 포커스 복귀. 같은 요소가 곧바로 다시 올라오면(StrictMode의 정리 → 다시 마운트)
// 복귀를 취소하고 연 자리를 이어받는다
type PendingRestore = { elementRef?: RefObject<HTMLElement | null>; opener: HTMLElement; cancelled: boolean }
let pendingRestores: PendingRestore[] = []
let savedOverflow = ''
let inertRoot: HTMLElement | null = null
const listeners = new Set<() => void>()

function setInert(el: HTMLElement | null | undefined, inert: boolean) {
  if (!el) return
  if (inert) el.setAttribute('inert', '')
  else el.removeAttribute('inert')
}

function syncInert() {
  setInert(inertRoot, layers.length > 0)
  layers.forEach((layer, index) => setInert(layer.elementRef?.current, index < layers.length - 1))
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  // 한글 조합 중의 Escape는 조합만 끝낸다(시트를 닫거나 편집을 되돌리지 않는다).
  // macOS Safari는 isComposing=false, keyCode 229로 보내기도 해서 lib/keyboard의 isImeComposing과 같은 기준을 쓴다
  if (e.isComposing || e.keyCode === 229) return
  layers.at(-1)?.onEscape()
}

function emit() {
  listeners.forEach((listener) => listener())
}

function pushLayer(layer: Omit<Layer, 'id' | 'opener'>): number {
  const id = nextId++
  const active = document.activeElement
  const insideLayer = !!active && !!layer.elementRef?.current?.contains(active)
  let opener = active instanceof HTMLElement && active !== document.body && !insideLayer ? active : null
  const reopened = layer.elementRef && pendingRestores.find((item) => item.elementRef === layer.elementRef)
  if (reopened) {
    reopened.cancelled = true
    opener = opener ?? reopened.opener
  }
  if (layers.length === 0) {
    savedOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeyDown)
  }
  layers = [...layers, { ...layer, id, opener }]
  syncInert()
  emit()
  return id
}

function removeLayer(id: number) {
  const layer = layers.find((item) => item.id === id)
  if (!layer) return
  // 아래 레이어의 inert를 지울 수 있게, 빠지는 레이어의 inert는 따로 정리한다
  setInert(layer.elementRef?.current, false)
  layers = layers.filter((item) => item.id !== id)
  if (layers.length === 0) {
    document.body.style.overflow = savedOverflow
    document.removeEventListener('keydown', handleKeyDown)
  }
  syncInert()

  // 포커스가 레이어 안(또는 아무 데도 없음)에 남아 있으면 연 자리로 돌려준다.
  // 이 함수는 React 커밋 도중(layout effect 정리)에 불린다. ReactDOM은 커밋 직후 커밋 전 포커스를 되돌리므로
  // 포커스 이동은 커밋이 끝난 뒤(마이크로태스크)에 한다. inert는 위에서 이미 풀었다.
  const active = document.activeElement
  const element = layer.elementRef?.current
  const focusLeftInLayer = !active || active === document.body || !!element?.contains(active)
  const opener = layer.opener
  if (focusLeftInLayer && opener) {
    const restore: PendingRestore = { elementRef: layer.elementRef, opener, cancelled: false }
    pendingRestores = [...pendingRestores, restore]
    queueMicrotask(() => {
      pendingRestores = pendingRestores.filter((item) => item !== restore)
      if (!restore.cancelled && opener.isConnected) opener.focus({ preventScroll: true })
    })
  }
  emit()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const getHasLayers = () => layers.length > 0

/** 지금 열린 오버레이가 있는지(렌더 밖에서 읽는 값). 토스트가 처음 뜰 때의 위치를 정할 때 쓴다 */
export const isOverlayOpen = getHasLayers

type OverlayLayerOptions = {
  // 맨 위일 때 Escape를 누르면 부른다. 없으면 Escape는 아무것도 닫지 않는다
  onEscape?: () => void
  // 다른 레이어가 위에 뜨면 inert로 둘 요소, 닫을 때 포커스가 안에 남았는지 확인할 요소
  elementRef?: RefObject<HTMLElement | null>
}

/**
 * active인 동안 오버레이 스택에 레이어로 올린다.
 * layout effect라서 시트 안 포커스 이동(useEffect의 panel.focus 등)보다 먼저 연 자리를 기억하고,
 * 닫힐 때는 화면을 그리기 전에 스택에서 빠진다. 그래서 시트를 닫으면서 띄운 토스트는 처음부터 아래에 뜬다.
 */
export function useOverlayLayer(active: boolean, { onEscape, elementRef }: OverlayLayerOptions = {}) {
  const escapeRef = useRef(onEscape)
  useEffect(() => {
    escapeRef.current = onEscape
  })

  useLayoutEffect(() => {
    if (!active) return
    const id = pushLayer({ onEscape: () => escapeRef.current?.(), elementRef })
    return () => removeLayer(id)
  }, [active, elementRef])
}

/** 열린 오버레이가 하나라도 있는지 */
export function useOverlayOpen() {
  return useSyncExternalStore(subscribe, getHasLayers, getHasLayers)
}

/** OverlayInertRoot가 앱 화면 요소를 알린다. 레이어가 열려 있으면 바로 inert로 둔다 */
export function setOverlayInertRoot(el: HTMLElement | null) {
  if (!el) setInert(inertRoot, false)
  inertRoot = el
  syncInert()
}
