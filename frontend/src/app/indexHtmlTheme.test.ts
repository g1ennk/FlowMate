import { afterEach, describe, expect, it, vi } from 'vitest'
import indexHtml from '../../index.html?raw'
import { storageKeys } from '../lib/storageKeys'

// index.html의 인라인 테마 스크립트. 앱 JS가 뜨기 전에 .dark를 붙여 첫 화면 깜빡임을 막는다.
function getThemeBootScript() {
  const doc = new DOMParser().parseFromString(indexHtml, 'text/html')
  const script = Array.from(doc.head.querySelectorAll('script')).find(
    (node) => !node.src && node.type !== 'module',
  )
  return script?.textContent ?? ''
}

function runThemeBootScript({ saved, prefersDark }: { saved: string | null; prefersDark: boolean }) {
  if (saved !== null) window.localStorage.setItem(storageKeys.theme, saved)
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
    matches: prefersDark && query === '(prefers-color-scheme: dark)',
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
  new Function(getThemeBootScript())()
  return document.documentElement.classList.contains('dark')
}

describe('index.html theme boot script', () => {
  afterEach(() => {
    document.documentElement.classList.remove('dark')
  })

  it('applies a saved dark theme before the app loads', () => {
    expect(runThemeBootScript({ saved: 'dark', prefersDark: false })).toBe(true)
  })

  it('keeps a saved light theme even when the system prefers dark', () => {
    expect(runThemeBootScript({ saved: 'light', prefersDark: true })).toBe(false)
  })

  it('follows the system when the theme is system or not saved', () => {
    expect(runThemeBootScript({ saved: 'system', prefersDark: true })).toBe(true)
    document.documentElement.classList.remove('dark')
    window.localStorage.clear()
    expect(runThemeBootScript({ saved: null, prefersDark: true })).toBe(true)
  })

  it('declares a theme-color for light and dark', () => {
    const doc = new DOMParser().parseFromString(indexHtml, 'text/html')
    const media = Array.from(doc.querySelectorAll('meta[name="theme-color"]')).map((node) =>
      node.getAttribute('media'),
    )
    expect(media).toEqual(['(prefers-color-scheme: light)', '(prefers-color-scheme: dark)'])
  })
})
