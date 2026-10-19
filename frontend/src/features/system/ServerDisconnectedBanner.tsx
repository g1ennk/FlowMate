import { useLayoutEffect, useRef, useState } from 'react'
import { recheckBackend } from './useBackendWatcher'

const OFFSET_VAR = '--top-banner-offset'

/** 쓰던 중 서버 연결이 끊겼을 때 화면을 바꾸지 않고 위에 띄우는 안내. 누르면 바로 다시 확인한다 */
function ServerDisconnectedBanner() {
  const ref = useRef<HTMLButtonElement>(null)
  const [checking, setChecking] = useState(false)

  // 토스트가 배너에 가리지 않도록 배너 높이를 알린다 (AppProviders의 Toaster가 사용)
  // 회전이나 글자 크기 변경으로 줄바꿈이 바뀌면 높이도 바뀌므로 다시 잰다.
  useLayoutEffect(() => {
    const root = document.documentElement
    const measure = () => root.style.setProperty(OFFSET_VAR, `${ref.current?.offsetHeight ?? 0}px`)
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    if (ref.current) observer?.observe(ref.current)
    return () => {
      observer?.disconnect()
      root.style.removeProperty(OFFSET_VAR)
    }
  }, [])

  const handleClick = async () => {
    setChecking(true)
    try {
      await recheckBackend()
    } finally {
      setChecking(false)
    }
  }

  return (
    <button
      ref={ref}
      type="button"
      onClick={handleClick}
      disabled={checking}
      className="sticky top-0 w-full bg-state-error px-4 pb-2 text-center text-xs font-medium text-white"
      // 열린 시트·풀스크린 타이머(9999)와 소리 시트(10000) 위에서도 보이고 누를 수 있게 한다.
      // 토스트(10002)는 배너 아래로 내려가므로 겹치지 않는다.
      style={{ zIndex: 10001, paddingTop: 'calc(var(--safe-top) + 0.5rem)' }}
    >
      서버에 연결할 수 없어요. 지금은 저장되지 않아요
      <span className="ml-1.5 underline">{checking ? '확인 중...' : '다시 확인'}</span>
    </button>
  )
}

export default ServerDisconnectedBanner
