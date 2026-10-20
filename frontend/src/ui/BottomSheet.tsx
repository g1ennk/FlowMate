import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { CloseIcon } from './Icons'
import { IconButton } from './IconButton'
import { useOverlayLayer } from './overlayStack'

// 바텀 시트. 면은 surface-card(timer tone은 timer-modal-bg)이고, 헤더는 제목 16/600 가운데 + 오른쪽에
// headerAction(동작 버튼)이 제목 줄에 맞춰 붙는다. 구분선은 없다. 주 버튼은 children 맨 아래에 둔다.
// 보이는 닫기 X는 기본으로 두지 않는다(사용자 결정 2026-10-20). 닫기는 바깥 누르기, 끌어내리기, Escape이고,
// 스크린리더와 키보드를 위해 시트 끝에 숨긴 "닫기" 버튼을 둔다(Tab으로 닿으면 보인다).
// role="dialog" + aria-modal이고 이름은 title(제목이 없으면 ariaLabel)이다.
// 닫히면 내려가는 애니메이션 동안만 inert + aria-hidden으로 남았다가 DOM에서 빠진다.
// 열린 동안은 overlayStack에 등록한다(Escape는 맨 위 시트만, 겹치면 아래 시트는 inert).

type BottomSheetProps = {
  isOpen: boolean
  onClose: () => void
  title?: string
  // 제목 줄이 없는 시트(자체 헤더를 그리는 시트)의 이름
  ariaLabel?: string
  children: ReactNode
  tone?: 'surface' | 'timer'
  panelClassName?: string
  contentClassName?: string
  // 제목 줄의 보이는 닫기 X. 기본은 끈다
  showCloseButton?: boolean
  // 시트 끝의 숨긴 닫기 버튼. 취소 버튼이 닫기를 겸하는 확인 시트만 끈다
  srCloseButton?: boolean
  // 제목 줄 왼쪽 칸(제목을 사이에 두고 오른쪽 동작과 짝을 이루는 버튼)
  headerLeading?: ReactNode
  headerAction?: ReactNode
  // Escape만 닫기와 다르게 다룰 때(메모 편집 중 Escape는 닫지 않고 고친 내용을 되돌린다). 없으면 onClose
  onEscape?: () => void
  zIndex?: number
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

// 시트 안에서 Tab으로 갈 수 있는 요소(숨김, aria-hidden 안, tabindex -1은 뺀다)
function tabbables(panel: HTMLElement) {
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.tabIndex >= 0 && !el.hidden && !el.closest('[aria-hidden="true"], [inert]'),
  )
}

const DRAG_CLOSE_THRESHOLD_PX = 96
const DRAG_CLOSE_VELOCITY_PX_PER_MS = 0.55
// 시트 슬라이드(0.3s)가 끝난 뒤 DOM에서 뺀다. transitionend가 오지 않아도 이 시간 뒤에는 뺀다
const EXIT_DURATION_MS = 320

const TONE = {
  surface: {
    panel: 'bg-surface-card',
    title: 'text-text-primary',
    srClose: 'focus-visible:text-text-secondary',
    handle: 'bg-border-strong',
    backdrop: 'bg-surface-overlay',
    elevation: 'shadow-float',
  },
  timer: {
    panel: 'bg-timer-modal-bg',
    title: 'text-timer-modal-text',
    srClose: 'focus-visible:text-timer-modal-secondary',
    handle: 'bg-timer-btn-hover',
    // 타이머 위의 막도 테마와 상관없이 같다(.impeccable.md §4-3)
    backdrop: 'bg-timer-overlay',
    elevation: 'shadow-timer-float',
  },
}

export function BottomSheet({
  isOpen,
  onClose,
  title,
  ariaLabel,
  children,
  tone = 'surface',
  panelClassName = '',
  contentClassName = '',
  showCloseButton = false,
  srCloseButton = true,
  headerLeading,
  headerAction,
  onEscape,
  zIndex = 9999,
}: BottomSheetProps) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const [rendered, setRendered] = useState(isOpen)
  const [dragOffsetY, setDragOffsetY] = useState(0)
  const [isDraggingSheet, setIsDraggingSheet] = useState(false)
  const dragSessionRef = useRef<{
    pointerId: number
    startY: number
    lastY: number
    startTime: number
  } | null>(null)
  const toneClasses = TONE[tone]

  // 열리면 곧바로 그린다(렌더 중 파생 상태 갱신)
  if (isOpen && !rendered) setRendered(true)

  const resetDragState = () => {
    dragSessionRef.current = null
    setIsDraggingSheet(false)
    setDragOffsetY(0)
  }

  // 닫힌 뒤 애니메이션이 끝나면 DOM에서 뺀다
  useEffect(() => {
    if (isOpen || !rendered) return
    const timer = window.setTimeout(() => setRendered(false), EXIT_DURATION_MS)
    return () => window.clearTimeout(timer)
  }, [isOpen, rendered])

  // 열린 동안 오버레이 스택에 올린다: 맨 위일 때만 Escape로 닫고, 스크롤 잠금과 뒤 화면 inert,
  // 닫힐 때 포커스를 연 자리로 돌려주는 일은 스택이 맡는다. 연 자리를 먼저 기억하도록 포커스 이동보다 앞에 둔다.
  useOverlayLayer(isOpen, { onEscape: onEscape ?? onClose, elementRef: panelRef })

  // 열릴 때 시트 안으로 포커스를 옮긴다
  useEffect(() => {
    if (!isOpen) return
    const panel = panelRef.current
    if (panel && !panel.contains(document.activeElement)) {
      panel.focus({ preventScroll: true })
    }
  }, [isOpen])

  // 뒤 화면이 inert라 마지막 요소에서 Tab을 누르면 포커스가 body로 사라진다. 처음과 끝을 이어 시트 안에서 돌게 한다
  const handleKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return
    const panel = panelRef.current
    if (!panel) return
    const items = tabbables(panel)
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement
    if (e.shiftKey && (active === first || active === panel)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && active === last) {
      e.preventDefault()
      first.focus()
    }
  }

  const handleDragStart = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!isOpen) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    dragSessionRef.current = {
      pointerId: e.pointerId,
      startY: e.clientY,
      lastY: e.clientY,
      startTime: performance.now(),
    }
    setIsDraggingSheet(true)
    setDragOffsetY(0)
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  const handleDragMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const session = dragSessionRef.current
    if (!session || session.pointerId !== e.pointerId) return
    session.lastY = e.clientY
    setDragOffsetY(Math.max(0, e.clientY - session.startY))
  }

  const finishDrag = (e: ReactPointerEvent<HTMLDivElement>, canceled = false) => {
    const session = dragSessionRef.current
    if (!session || session.pointerId !== e.pointerId) return

    e.currentTarget.releasePointerCapture?.(e.pointerId)

    const deltaY = Math.max(0, session.lastY - session.startY)
    const elapsedMs = Math.max(1, performance.now() - session.startTime)
    const velocity = deltaY / elapsedMs

    resetDragState()

    if (canceled) return
    if (deltaY >= DRAG_CLOSE_THRESHOLD_PX || velocity >= DRAG_CLOSE_VELOCITY_PX_PER_MS) {
      onClose()
    }
  }

  if (!rendered) return null

  const shouldDisableSheetTransition = isOpen && isDraggingSheet
  // 움직임 줄이기: 여는 슬라이드는 globals.css가 페이드로 바꾸고, 닫을 때는 내려가지 않고 제자리에서 바로 흐려진다(0.05초).
  // transform 전환을 두지 않으므로 끌어내리다 놓아도 미끄러지지 않는다
  const reduceMotion = prefersReducedMotion()
  const panelMotionClass = reduceMotion
    ? `transition-opacity duration-[50ms] ${isOpen ? '' : 'opacity-0'}`
    : shouldDisableSheetTransition
      ? 'transition-none'
      : 'transition-transform duration-300 ease-out'
  const closedTransform = reduceMotion ? 'none' : 'translateY(100%)'

  return createPortal(
    <div
      className={`fixed inset-0 ${isOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}
      style={{ zIndex }}
      aria-hidden={isOpen ? undefined : true}
      inert={!isOpen}
    >
      {/* 배경 */}
      <div
        className={`absolute inset-0 ${toneClasses.backdrop} transition-opacity duration-300 ${
          isOpen ? 'opacity-100 animate-overlay-in' : 'opacity-0'
        }`}
        onClick={onClose}
      />

      {/* 시트 */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center">
        <div className="w-full sm:max-w-lg sm:px-5">
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            // 타이머 시트 안은 앱 테마 포커스 링 대신 timer-focus-ring을 쓴다(globals.css, §4-3)
            data-tone={tone}
            aria-labelledby={title ? titleId : undefined}
            aria-label={title ? undefined : ariaLabel}
            tabIndex={-1}
            onKeyDown={handleKeyDown}
            className={`pointer-events-auto flex w-full max-h-[85dvh] flex-col overflow-hidden rounded-t-sheet outline-none ${toneClasses.elevation} ${toneClasses.panel} ${panelMotionClass} ${isOpen ? 'animate-slide-up' : ''} ${panelClassName}`}
            style={{
              transform: isOpen ? `translateY(${dragOffsetY}px)` : closedTransform,
            }}
            onTransitionEnd={(e) => {
              if (e.target !== e.currentTarget) return
              if (!isOpen) {
                resetDragState()
                setRendered(false)
              }
            }}
          >
            <div
              className="flex cursor-grab touch-none justify-center py-3 active:cursor-grabbing"
              onPointerDown={handleDragStart}
              onPointerMove={handleDragMove}
              onPointerUp={(e) => finishDrag(e)}
              onPointerCancel={(e) => finishDrag(e, true)}
            >
              <div className={`h-1 w-10 rounded-full ${toneClasses.handle}`} />
            </div>

            {/* 헤더: 양옆 칸을 같은 비율로 두어 제목을 가운데에 둔다. 제목이 길면 왼쪽 칸이 먼저 줄어든다.
                양옆 글자 버튼(ghost/plain/danger sm, 안쪽 12)의 글자가 시트 내용 여백(20)에 맞도록 머리 여백은 8이다(Task 21) */}
            {title && (
              <div className="flex min-h-11 items-center gap-list px-2">
                <div className="flex flex-1 basis-0 items-center justify-start gap-list">{headerLeading}</div>
                <h2
                  id={titleId}
                  // 긴 할 일 이름도 알아볼 수 있게 두 줄까지 보인다
                  className={`min-w-0 line-clamp-2 break-keep text-center text-base font-semibold wrap-anywhere ${toneClasses.title}`}
                >
                  {title}
                </h2>
                <div className="flex flex-1 basis-0 items-center justify-end gap-list">
                  {headerAction}
                  {showCloseButton && (
                    <IconButton label="닫기" tone={tone} onClick={onClose}>
                      <CloseIcon />
                    </IconButton>
                  )}
                </div>
              </div>
            )}

            {/* 컨텐츠 */}
            <div
              className={`bottom-sheet-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-sheet pb-8 pt-list touch-pan-y ${contentClassName}`}
              style={{
                paddingBottom: 'max(32px, env(safe-area-inset-bottom))',
                WebkitOverflowScrolling: 'touch',
              }}
            >
              {children}
              {/* 보이는 X가 없을 때의 닫기. 평소에는 화면에서 숨기고(sr-only), 키보드로 닿으면 시트 끝에 글자 버튼으로 보인다.
                  Tab 순서의 마지막이라 시트 안 Tab 순환의 끝이다 */}
              {srCloseButton && !showCloseButton && (
                <button
                  type="button"
                  onClick={onClose}
                  className={`sr-only focus-visible:not-sr-only focus-visible:mt-list focus-visible:flex focus-visible:min-h-11 focus-visible:w-full focus-visible:items-center focus-visible:justify-center focus-visible:rounded-control focus-visible:text-sm focus-visible:font-medium ${toneClasses.srClose}`}
                >
                  닫기
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

// 시트 목록 한 줄(48). 글자는 시트 내용 여백(20)에, 아이콘은 목록 앞 열(32 칸 가운데)에 두고 글자 열은 그 뒤 8이다.
// 오른쪽 표지(고른 값 체크)는 내용 오른쪽 선에 붙는다. hover 면만 양옆 8 넓힌다(ListRow와 같다)
type BottomSheetItemProps = {
  icon?: ReactNode
  rightIcon?: ReactNode
  label: string
  onClick: () => void
  variant?: 'default' | 'danger'
  disabled?: boolean
  // 고르는 목록에서 지금 값(오른쪽 체크)이면 true. 스크린리더에는 aria-current로 읽힌다
  selected?: boolean
  className?: string
}

export function BottomSheetItem({
  icon,
  rightIcon,
  label,
  onClick,
  variant = 'default',
  disabled = false,
  selected,
  className = '',
}: BottomSheetItemProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-current={selected ? 'true' : undefined}
      type="button"
      className={`relative isolate flex min-h-12 w-full items-center gap-list py-2 text-left before:absolute before:-inset-x-2 before:inset-y-0 before:-z-10 before:rounded-control before:transition-colors ${
        disabled
          ? 'cursor-not-allowed opacity-40'
          : variant === 'danger'
            ? 'text-state-error-text hover:before:bg-state-error-subtle'
            : 'text-text-primary hover:before:bg-hover'
      } ${className}`}
    >
      {icon && <span className="flex h-5 w-8 shrink-0 items-center justify-center">{icon}</span>}
      <span className="min-w-0 flex-1 text-sm">{label}</span>
      {rightIcon && <span className="flex h-5 shrink-0 items-center">{rightIcon}</span>}
    </button>
  )
}
