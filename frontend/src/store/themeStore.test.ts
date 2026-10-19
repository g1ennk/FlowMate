import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useThemeStore } from './themeStore'

function addThemeColorMetas() {
  for (const scheme of ['light', 'dark']) {
    const meta = document.createElement('meta')
    meta.name = 'theme-color'
    meta.media = `(prefers-color-scheme: ${scheme})`
    meta.content = scheme === 'light' ? '#fafafa' : '#1e1e1e'
    document.head.appendChild(meta)
  }
}

function themeColors() {
  return Array.from(document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')).map(
    (meta) => meta.content,
  )
}

describe('themeStore', () => {
  beforeEach(() => {
    addThemeColorMetas()
  })

  afterEach(() => {
    useThemeStore.getState().setTheme('system')
    document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.remove())
  })

  it('paints the browser bar with the chosen theme even when the system differs', () => {
    useThemeStore.getState().setTheme('dark')
    expect(themeColors()).toEqual(['#1e1e1e', '#1e1e1e'])

    useThemeStore.getState().setTheme('light')
    expect(themeColors()).toEqual(['#fafafa', '#fafafa'])
  })
})
