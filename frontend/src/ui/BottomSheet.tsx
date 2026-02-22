import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CloseIcon } from './Icons'

type BottomSheetProps = {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  panelClassName?: string
  contentClassName?: string
  titleClassName?: string
  hideHandle?: boolean
  showCloseButton?: boolean
  showHeaderDivider?: boolean
  closeButtonAriaLabel?: string
  headerAction?: ReactNode
}

const DRAG_CLOSE_THRESHOLD_PX = 96
const DRAG_CLOSE_VELOCITY_PX_PER_MS = 0.55

export function BottomSheet({
  isOpen,
  onClose,
  title,
  children,
  panelClassName = '',
  contentClassName = '',
  titleClassName = '',
  hideHandle = false,
  showCloseButton = false,
  showHeaderDivider = true,
  closeButtonAriaLabel = 'Close',
  headerAction,
}: BottomSheetProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dragOffsetY, setDragOffsetY] = useState(0)
  const [isDraggingSheet, setIsDraggingSheet] = useState(false)
  const dragSessionRef = useRef<{
    pointerId: number
    startY: number
    lastY: number
    startTime: number
  } | null>(null)

  const resetDragState = () => {
    dragSessionRef.current = null
    setIsDraggingSheet(false)
    setDragOffsetY(0)
  }

  useEffect(() => {
    const node = containerRef.current
    if (!node) return
    if (isOpen) {
      node.removeAttribute('inert')
    } else {
      node.setAttribute('inert', '')
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) {
      resetDragState()
    }
  }, [isOpen])

  // ESC 키로 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [isOpen, onClose])

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

  return createPortal(
    <div
      ref={containerRef}
      className={`fixed inset-0 ${isOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}
      style={{ zIndex: 9999 }}
      aria-hidden={!isOpen}
    >
      {/* 배경 */}
      <div
        className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
      />

      {/* 시트 */}
      <div
        className={`absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col overflow-hidden rounded-t-3xl bg-white shadow-xl ${
          isDraggingSheet ? 'transition-none' : 'transition-transform duration-300 ease-out'
        } ${panelClassName}`}
        style={{
          transform: isOpen ? `translateY(${dragOffsetY}px)` : 'translateY(100%)',
        }}
      >
        {hideHandle && (
          <div
            className="h-2 touch-none"
            onPointerDown={handleDragStart}
            onPointerMove={handleDragMove}
            onPointerUp={(e) => finishDrag(e)}
            onPointerCancel={(e) => finishDrag(e, true)}
          />
        )}

        {!hideHandle && (
          <div
            className="flex cursor-grab touch-none justify-center py-3 active:cursor-grabbing"
            onPointerDown={handleDragStart}
            onPointerMove={handleDragMove}
            onPointerUp={(e) => finishDrag(e)}
            onPointerCancel={(e) => finishDrag(e, true)}
          >
            <div className="h-1 w-10 rounded-full bg-gray-300" />
          </div>
        )}

        {/* 타이틀 */}
        {title && (
          <div
            className={`relative px-5 pb-3 ${
              showHeaderDivider ? 'border-b border-gray-100' : ''
            }`}
          >
            <h3 className={`text-center text-base font-semibold text-gray-900 truncate ${titleClassName}`}>{title}</h3>
            {headerAction && (
              <div className={`absolute top-1/2 -translate-y-1/2 ${showCloseButton ? 'right-12' : 'right-4'}`}>
                {headerAction}
              </div>
            )}
            {showCloseButton && (
              <button
                type="button"
                aria-label={closeButtonAriaLabel}
                onClick={onClose}
                className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full p-1 text-gray-400 transition-colors hover:text-gray-600"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            )}
          </div>
        )}

        {/* 컨텐츠 */}
        <div
          className={`bottom-sheet-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-8 pt-2 touch-pan-y ${contentClassName}`}
          style={{
            paddingBottom: 'max(32px, env(safe-area-inset-bottom))',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body,
  )
}

type BottomSheetItemProps = {
  icon?: ReactNode
  rightIcon?: ReactNode
  label: string
  onClick: () => void
  variant?: 'default' | 'danger'
  disabled?: boolean
  className?: string
}

export function BottomSheetItem({
  icon,
  rightIcon,
  label,
  onClick,
  variant = 'default',
  disabled = false,
  className = '',
}: BottomSheetItemProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-left transition-all ${
        disabled
          ? 'cursor-not-allowed opacity-40'
          : variant === 'danger'
            ? 'text-red-500 hover:bg-red-50'
            : 'text-gray-700 hover:bg-gray-50'
      } ${className}`}
    >
      {icon && <span className="flex h-6 w-6 items-center justify-center">{icon}</span>}
      <span className="text-sm font-medium">{label}</span>
      {rightIcon && <span className="ml-auto flex h-5 w-5 items-center justify-center">{rightIcon}</span>}
    </button>
  )
}

type BottomSheetActionsProps = {
  children: ReactNode
}

export function BottomSheetActions({ children }: BottomSheetActionsProps) {
  return (
    <div className="mb-4 grid grid-cols-2 gap-3">
      {children}
    </div>
  )
}

type BottomSheetActionButtonProps = {
  icon?: ReactNode
  label: string
  onClick: () => void
  variant?: 'default' | 'danger'
}

export function BottomSheetActionButton({
  icon,
  label,
  onClick,
  variant = 'default',
}: BottomSheetActionButtonProps) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-1.5 rounded-xl py-4 bg-gray-50 text-gray-900 transition-colors hover:bg-gray-100"
    >
      {icon && (
        <span className={`flex h-6 w-6 items-center justify-center ${
          variant === 'danger' ? 'text-red-500' : 'text-blue-500'
        }`}>
          {icon}
        </span>
      )}
      <span className="text-xs font-medium">{label}</span>
    </button>
  )
}
