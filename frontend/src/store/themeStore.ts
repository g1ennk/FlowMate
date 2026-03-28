import { create } from 'zustand'
import { storageKeys } from '../lib/storageKeys'

type Theme = 'light' | 'dark' | 'system'

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

function applyTheme(resolved: 'light' | 'dark') {
  document.documentElement.classList.toggle('dark', resolved === 'dark')
}

function loadSavedTheme(): Theme {
  const saved = localStorage.getItem(storageKeys.theme)
  if (saved === 'light' || saved === 'dark' || saved === 'system') return saved
  return 'system'
}

const initial = loadSavedTheme()
const initialResolved = resolveTheme(initial)
applyTheme(initialResolved)

export const useThemeStore = create<ThemeStore>((set) => ({
  theme: initial,
  resolved: initialResolved,

  setTheme: (theme) => {
    const resolved = resolveTheme(theme)
    localStorage.setItem(storageKeys.theme, theme)
    applyTheme(resolved)
    set({ theme, resolved })
  },
}))

darkMQL.addEventListener('change', () => {
  const { theme, setTheme } = useThemeStore.getState()
  if (theme === 'system') setTheme('system')
})
