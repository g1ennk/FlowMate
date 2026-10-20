import { useEffect, useLayoutEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { ClockIcon } from '../../../ui/Icons'
import type { TimerMode } from '../../timer/timerTypes'
import { TIMER_MODE_OPTIONS } from '../timerStartRules'

type StartFocusMenuProps = {
  todoTitle: string
  // 메뉴를 연 집중 시작 버튼. 메뉴는 이 버튼 바로 아래(공간이 없으면 위)에 오른쪽 끝을 맞춰 뜬다
  anchor: HTMLElement
  // 마지막에 쓴 모드. 그 항목에 "최근"을 붙이고 처음 포커스를 둔다(없으면 첫 항목)
  lastMode: TimerMode | null
  onChoose: (mode: TimerMode) => void
  onClose: () => void
}

// 버튼과 메뉴 사이, 화면 가장자리와 메뉴 사이 간격
const GAP_PX = 4
const EDGE_PX = 8

// 행의 집중 시작 버튼에 붙어 뜨는 작은 메뉴: 메뉴 시트의 타이머 두 항목(같은 이름, 같은 아이콘 색)만 둔다.
// 배경을 덮지 않는다. 바깥을 누르거나 스크롤하면 닫고, Escape(또는 Tab)로 닫으면 포커스를 버튼으로 돌려준다
export function StartFocusMenu({ todoTitle, anchor, lastMode, onChoose, onClose }: StartFocusMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const focusIndex = Math.max(0, TIMER_MODE_OPTIONS.findIndex(({ mode }) => mode === lastMode))

  const items = () => Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])

  // 그리기 전에 자리를 잡는다. 아래 탭 막대 위까지만 쓰고, 넘치면 버튼 위로 올린다
  useLayoutEffect(() => {
    const menu = menuRef.current
    if (!menu) return
    const rect = anchor.getBoundingClientRect()
    const navTop = document.querySelector('[data-bottom-nav]')?.getBoundingClientRect().top ?? window.innerHeight
    const bottomLimit = Math.min(window.innerHeight, navTop) - EDGE_PX
    let top = rect.bottom + GAP_PX
    if (top + menu.offsetHeight > bottomLimit) top = Math.max(EDGE_PX, rect.top - GAP_PX - menu.offsetHeight)
    const left = Math.min(Math.max(EDGE_PX, rect.right - menu.offsetWidth), window.innerWidth - EDGE_PX - menu.offsetWidth)
    menu.style.top = `${top}px`
    menu.style.left = `${left}px`
    menu.style.visibility = 'visible'
  }, [anchor])

  useEffect(() => {
    items()[focusIndex]?.focus({ preventScroll: true })
  }, [focusIndex])

  // 그릴 때마다 버튼이 아직 화면에 붙어 있는지 본다. 행이 다시 그려지거나 사라져 떨어졌으면 빈 자리에 남지 않게 닫는다
  useLayoutEffect(() => {
    if (!anchor.isConnected) onClose()
  })

  // 바깥 누르기, 스크롤, 화면 크기 바뀜이면 닫는다. 버튼을 다시 누르는 것은 버튼이 맡는다(열고 닫기)
  useEffect(() => {
    const closeAndRestore = () => {
      const active = document.activeElement
      if (!active || active === document.body || menuRef.current?.contains(active)) anchor.focus({ preventScroll: true })
      onClose()
    }
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null
      if (target && (menuRef.current?.contains(target) || anchor.contains(target))) return
      closeAndRestore()
    }
    document.addEventListener('pointerdown', handlePointerDown, true)
    window.addEventListener('scroll', closeAndRestore, true)
    window.addEventListener('resize', closeAndRestore)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true)
      window.removeEventListener('scroll', closeAndRestore, true)
      window.removeEventListener('resize', closeAndRestore)
    }
  }, [anchor, onClose])

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const list = items()
    const index = list.indexOf(document.activeElement as HTMLElement)
    const move = (next: number) => {
      e.preventDefault()
      list[(next + list.length) % list.length]?.focus()
    }
    switch (e.key) {
      case 'ArrowDown':
        move(index + 1)
        return
      case 'ArrowUp':
        move(index - 1)
        return
      case 'Home':
        move(0)
        return
      case 'End':
        move(list.length - 1)
        return
      case 'Escape':
      case 'Tab':
        e.preventDefault()
        e.stopPropagation()
        anchor.focus({ preventScroll: true })
        onClose()
        return
    }
  }

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={`${todoTitle} 타이머 고르기`}
      onKeyDown={handleKeyDown}
      // 자리를 잡기 전에는 숨긴다(useLayoutEffect가 그리기 전에 보인다)
      style={{ visibility: 'hidden' }}
      className="fixed z-50 w-48 rounded-control border border-card-border bg-surface-card p-1 shadow-float"
    >
      {TIMER_MODE_OPTIONS.map(({ mode, label, color }) => (
        <button
          key={mode}
          type="button"
          role="menuitem"
          tabIndex={-1}
          onClick={() => onChoose(mode)}
          className="flex min-h-11 w-full items-center gap-list rounded-[8px] px-2 text-left text-sm text-text-primary transition-colors hover:bg-hover"
        >
          <ClockIcon aria-hidden className={`h-5 w-5 shrink-0 ${color}`} />
          <span className="min-w-0 flex-1">{label}</span>
          {mode === lastMode && <span className="text-xs text-text-secondary">최근</span>}
        </button>
      ))}
    </div>,
    document.body,
  )
}
