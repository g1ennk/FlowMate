import { useEffect, useCallback, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useThemeStore } from '../store/themeStore'

export type ShortcutEntry = {
  key: string
  label: string
  description: string
}

export const SHORTCUTS: ShortcutEntry[] = [
  { key: '1', label: '1', description: '계획 탭으로 이동' },
  { key: '2', label: '2', description: '회고 탭으로 이동' },
  { key: '3', label: '3', description: '설정 탭으로 이동' },
  { key: 'd', label: 'D', description: '다크 모드 토글' },
  { key: '?', label: '?', description: '단축키 도움말 열기/닫기' },
]

const TAB_ROUTES = ['/todos', '/review', '/settings'] as const

function isInputFocused() {
  const el = document.activeElement
  if (!el) return false
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if ((el as HTMLElement).isContentEditable) return true
  return false
}

export function useKeyboardShortcuts() {
  const navigate = useNavigate()
  const location = useLocation()
  const setTheme = useThemeStore((s) => s.setTheme)
  const resolved = useThemeStore((s) => s.resolved)
  const [helpOpen, setHelpOpen] = useState(false)

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (isInputFocused() && e.key !== 'Escape') return

      // 풀스크린 타이머가 열려 있으면 단축키 비활성화
      if (document.querySelector('[data-timer-fullscreen]')) return

      switch (e.key) {
        case '1':
        case '2':
        case '3': {
          const route = TAB_ROUTES[Number(e.key) - 1]
          if (location.pathname !== route) {
            navigate(route)
          }
          e.preventDefault()
          break
        }
        case 'd':
        case 'D':
          setTheme(resolved === 'dark' ? 'light' : 'dark')
          e.preventDefault()
          break
        case '?':
          setHelpOpen((prev) => !prev)
          e.preventDefault()
          break
        case 'Escape':
          if (helpOpen) {
            setHelpOpen(false)
            e.preventDefault()
          }
          break
      }
    },
    [navigate, location.pathname, setTheme, resolved, helpOpen],
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return { helpOpen, setHelpOpen }
}
