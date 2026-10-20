import { useLayoutEffect, useState, type RefObject } from 'react'

export type ElementSize = { width: number; height: number }

// 요소의 안쪽(content box) 크기를 잰다. 처음 재기 전과 ResizeObserver가 없는 환경에서는 null이다.
// 회전, 주소창 접힘, 글자 크기 변경으로 크기가 바뀌면 다시 잰다
export function useElementSize<T extends HTMLElement>(ref: RefObject<T | null>): ElementSize | null {
  const [size, setSize] = useState<ElementSize | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const update = (width: number, height: number) => {
      setSize((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }))
    }
    const observer = new ResizeObserver(([entry]) => {
      if (entry) update(Math.floor(entry.contentRect.width), Math.floor(entry.contentRect.height))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])

  return size
}
