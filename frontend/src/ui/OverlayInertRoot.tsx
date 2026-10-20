import { useLayoutEffect, useRef, type PropsWithChildren } from 'react'
import { setOverlayInertRoot } from './overlayStack'

/** 오버레이(시트, 타이머 풀스크린)가 열려 있는 동안 inert가 되는 앱 화면. 토스트와 상단 배너는 이 바깥에 둔다 */
export function OverlayInertRoot({ children }: PropsWithChildren) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    setOverlayInertRoot(ref.current)
    return () => setOverlayInertRoot(null)
  }, [])
  // #root가 flex column이라 그 흐름을 그대로 잇는다
  return (
    <div ref={ref} className="flex flex-1 flex-col">
      {children}
    </div>
  )
}
