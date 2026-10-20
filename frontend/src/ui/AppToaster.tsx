import { useCallback, useLayoutEffect, type CSSProperties, type ReactNode } from 'react'
import {
  ToastBar,
  resolveValue,
  useToaster,
  type DefaultToastOptions,
  type Toast,
  type ToastPosition,
} from 'react-hot-toast'
import { ExclamationTriangleIcon } from './Icons'
import { isOverlayOpen, useOverlayOpen } from './overlayStack'

// 앱의 토스트 하나(.impeccable.md §7 Toast).
// - 기본은 화면 아래, 하단 탭 위 8px. 하단 탭이 없는 화면(로그인 등)에서는 safe-bottom 위 8px이다.
//   선택 모드의 일괄 동작 바가 떠 있으면 그 위로 올린다(--toast-bottom-offset, globals.css).
// - 시트나 타이머 풀스크린이 열려 있으면 화면 위(safe-top과 상단 배너 아래)에 띄워 시트 맨 아래 주 버튼과 키보드를 가리지 않는다.
// - 위치는 토스트마다 처음 뜰 때 정하고 지킨다. 시트를 닫아도 떠 있던 토스트가 위아래로 옮겨 가지 않는다.
//   그래서 react-hot-toast의 Toaster 대신 useToaster로 직접 그린다(배치 계산은 Toaster와 같다).
// - 시트, 상단 배너보다 위에 그린다. 앱 화면이 inert여도 눌리도록 OverlayInertRoot 바깥에 둔다.
// - 성공은 글자만, 실패만 선 아이콘을 붙인다.

const Z_INDEX = 10002
const GUTTER = 8
const SIDE_OFFSET = 16

const TOAST_OPTIONS: DefaultToastOptions = {
  duration: 2000,
  style: {
    background: 'var(--color-toast-bg)',
    color: 'var(--color-toast-text)',
    borderRadius: 'var(--radius-control)',
    boxShadow: 'var(--shadow-float)',
    padding: '12px 16px',
    fontSize: '14px',
    // 좁은 화면에서도 잘리지 않게 화면 폭 안에서 줄바꿈한다.
    maxWidth: 'min(420px, calc(100vw - 32px))',
    // 한국어는 어절 단위로 줄바꿈하고, 긴 URL처럼 한 덩어리가 넘칠 때만 중간에서 끊는다.
    wordBreak: 'keep-all',
    overflowWrap: 'anywhere',
  },
  success: { icon: null },
  error: { icon: <ExclamationTriangleIcon className="h-5 w-5 shrink-0" /> },
}

// 토스트 id → 처음 뜰 때의 위치. 렌더에서는 읽기만 하고 커밋 뒤(layout effect)에 기록한다
const placements = new Map<string, ToastPosition>()

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

function positionStyle(position: ToastPosition, offset: number): CSSProperties {
  const top = position.startsWith('top')
  return {
    left: 0,
    right: 0,
    display: 'flex',
    justifyContent: 'center',
    position: 'absolute',
    transition: prefersReducedMotion() ? undefined : 'all 230ms cubic-bezier(.21,1.02,.73,1)',
    transform: `translateY(${offset * (top ? 1 : -1)}px)`,
    ...(top ? { top: 0 } : { bottom: 0 }),
  }
}

function ToastWrapper({ id, onHeightUpdate, visible, style, children }: {
  id: string
  onHeightUpdate: (id: string, height: number) => void
  visible: boolean
  style: CSSProperties
  children: ReactNode
}) {
  // 높이를 재서 같은 위치의 토스트를 쌓는다(문구가 바뀌면 다시 잰다)
  const ref = useCallback(
    (el: HTMLDivElement | null) => {
      if (!el) return
      const update = () => onHeightUpdate(id, el.getBoundingClientRect().height)
      update()
      const observer = new MutationObserver(update)
      observer.observe(el, { subtree: true, childList: true, characterData: true })
      return () => observer.disconnect()
    },
    [id, onHeightUpdate],
  )

  return (
    <div
      ref={ref}
      className={visible ? '[&>*]:pointer-events-auto' : ''}
      style={{ ...style, zIndex: visible ? 9999 : undefined }}
    >
      {children}
    </div>
  )
}

export function AppToaster() {
  const overlayOpen = useOverlayOpen()
  const current: ToastPosition = overlayOpen ? 'top-center' : 'bottom-center'
  const { toasts, handlers } = useToaster(TOAST_OPTIONS)
  const placementOf = (t: Toast) => placements.get(t.id) ?? t.position ?? current

  // 새로 그린 토스트의 위치를 기록하고, 사라진 토스트는 지운다.
  // 렌더 때의 값이 아니라 지금 스택을 읽는다. 시트를 닫는 동작과 같은 렌더에서 뜬 토스트는 닫힌 뒤 기준(아래)이 된다
  useLayoutEffect(() => {
    const ids = new Set(toasts.map((t) => t.id))
    for (const id of placements.keys()) if (!ids.has(id)) placements.delete(id)
    const live: ToastPosition = isOverlayOpen() ? 'top-center' : 'bottom-center'
    for (const t of toasts) if (!placements.has(t.id)) placements.set(t.id, t.position ?? live)
  })

  // 같은 위치에서 이 토스트보다 새 토스트(앞쪽)들의 높이만큼 가장자리에서 띄운다
  const offsetOf = (t: Toast, position: ToastPosition) => {
    const same = toasts.filter((x) => placementOf(x) === position && x.height)
    const index = same.findIndex((x) => x.id === t.id)
    return same
      .slice(0, Math.max(0, index))
      .filter((x) => x.visible)
      .reduce((sum, x) => sum + (x.height ?? 0) + GUTTER, 0)
  }

  return (
    <div
      style={{
        position: 'fixed',
        // BottomSheet·TimerFullScreen(9999), SoundSheet(10000), 상단 배너(10001)보다 위에 보이도록 한다.
        zIndex: Z_INDEX,
        // 상단 배너가 떠 있으면 그 아래로 내린다 (배너 높이에 safe-top 포함)
        top: 'calc(var(--top-banner-offset, var(--safe-top)) + 8px)',
        bottom: 'calc(var(--toast-bottom-offset, 0px) + var(--safe-bottom) + 8px)',
        // 일괄 동작 바가 뜨고 내려갈 때 떠 있던 토스트가 순간 이동하지 않고 바를 따라 움직인다
        transition: prefersReducedMotion() ? undefined : 'bottom 200ms ease-out',
        left: SIDE_OFFSET,
        right: SIDE_OFFSET,
        pointerEvents: 'none',
      }}
      onMouseEnter={handlers.startPause}
      onMouseLeave={handlers.endPause}
    >
      {toasts.map((t) => {
        const position = placementOf(t)
        return (
          <ToastWrapper
            key={t.id}
            id={t.id}
            onHeightUpdate={handlers.updateHeight}
            visible={t.visible}
            style={positionStyle(position, offsetOf(t, position))}
          >
            {t.type === 'custom' ? resolveValue(t.message, t) : <ToastBar toast={t} position={position} />}
          </ToastWrapper>
        )
      })}
    </div>
  )
}
