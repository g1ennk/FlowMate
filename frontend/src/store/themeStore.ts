import { create } from 'zustand'
import { storageKeys } from '../lib/storageKeys'

export type Theme = 'light' | 'dark' | 'system'

interface ThemeStore {
  theme: Theme
  resolved: 'light' | 'dark'
  setTheme: (theme: Theme) => void
}

const darkMQL = window.matchMedia('(prefers-color-scheme: dark)')

function resolveTheme(theme: Theme): 'light' | 'dark' {
  if (theme !== 'system') return theme
  return darkMQL.matches ? 'dark' : 'light'
}

// 브라우저 상단 색(theme-color). index.html의 meta 값과 같다.
const THEME_COLORS = { light: '#fafafa', dark: '#1e1e1e' } as const

function applyTheme(theme: Theme, resolved: 'light' | 'dark') {
  document.documentElement.classList.toggle('dark', resolved === 'dark')
  // 직접 고른 테마면 두 meta를 그 색으로 덮고, 시스템이면 각 media 색으로 되돌린다.
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    const scheme = meta.media.includes('dark') ? 'dark' : 'light'
    meta.content = THEME_COLORS[theme === 'system' ? scheme : resolved]
  })
}

// index.html 인라인 스크립트가 같은 키·규칙으로 첫 화면 테마를 먼저 적용한다. 바꾸면 함께 바꾼다.
function loadSavedTheme(): Theme {
  const saved = localStorage.getItem(storageKeys.theme)
  if (saved === 'light' || saved === 'dark' || saved === 'system') return saved
  return 'system'
}

const initial = loadSavedTheme()
const initialResolved = resolveTheme(initial)
applyTheme(initial, initialResolved)

export const useThemeStore = create<ThemeStore>((set) => ({
  theme: initial,
  resolved: initialResolved,

  setTheme: (theme) => {
    const resolved = resolveTheme(theme)
    localStorage.setItem(storageKeys.theme, theme)
    applyTheme(theme, resolved)
    set({ theme, resolved })
  },
}))

darkMQL.addEventListener('change', () => {
  const { theme, setTheme } = useThemeStore.getState()
  if (theme === 'system') setTheme('system')
})
