import { useEffect } from 'react'

const getScrollContainer = () =>
  document.querySelector('main') as HTMLElement | null

export function useReviewScrollMemory(key: string) {
  useEffect(() => {
    const storageKey = `review-scroll:${key}`
    const container = getScrollContainer()

    const raw = sessionStorage.getItem(storageKey)
    if (raw) {
      const savedTop = Number(raw)
      if (Number.isFinite(savedTop) && savedTop >= 0) {
        requestAnimationFrame(() => {
          if (container) {
            container.scrollTo({ top: savedTop })
          } else {
            window.scrollTo({ top: savedTop })
          }
        })
      }
    }

    return () => {
      const top = container ? container.scrollTop : window.scrollY
      sessionStorage.setItem(storageKey, String(top))
    }
  }, [key])
}
