import { useLayoutEffect, useRef } from 'react'

// 화면 맨 위 경고 줄(.impeccable.md §7 TopBanner). 서버 끊김과 오프라인이 같이 쓴다.
// error-strong 위 흰 글자, safe-top 패딩, role="status". 문구는 결과(저장되는지)를 말한다.
// onAction이 있으면 배너 전체가 버튼이다(누르면 바로 다시 확인).

const OFFSET_VAR = '--top-banner-offset'

type TopBannerProps = {
  message: string
  actionLabel?: string
  onAction?: () => void
  actionDisabled?: boolean
}

export function TopBanner({ message, actionLabel, onAction, actionDisabled = false }: TopBannerProps) {
  const ref = useRef<HTMLDivElement>(null)

  // 토스트와 타이머 풀스크린 헤더가 배너에 가리지 않도록 배너 높이를 알린다 (AppToaster, TimerFullScreen이 사용)
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

  // 배너 전체가 버튼일 때도 터치 영역이 44 이상이 되게 safe-top 아래 높이를 44로 잡는다(§6-2)
  const contentClass = 'flex w-full items-center justify-center px-4 pb-2 text-center'
  const contentStyle = { paddingTop: 'calc(var(--safe-top) + 8px)', minHeight: 'calc(var(--safe-top) + 44px)' }
  const content = (
    <span>
      {message}
      {actionLabel && <span className="ml-1 underline">{actionLabel}</span>}
    </span>
  )

  return (
    <div
      ref={ref}
      role="status"
      className="sticky top-0 w-full bg-state-error-strong text-xs font-medium text-on-error"
      // 열린 시트·풀스크린 타이머(9999)와 소리 시트(10000) 위에서도 보이고 누를 수 있게 한다.
      // 토스트(10002)는 배너 아래로 내려가므로 겹치지 않는다.
      style={{ zIndex: 10001 }}
    >
      {onAction ? (
        <button
          type="button"
          onClick={onAction}
          disabled={actionDisabled}
          className={contentClass}
          style={contentStyle}
        >
          {content}
        </button>
      ) : (
        <p className={contentClass} style={contentStyle}>
          {content}
        </p>
      )}
    </div>
  )
}
