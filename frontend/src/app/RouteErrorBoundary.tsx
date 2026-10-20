import { useEffect, useRef } from 'react'
import { useLocation, useNavigate, useRouteError } from 'react-router-dom'
import { systemMessages } from '../lib/messages'
import { SystemMessage } from '../ui/SystemMessage'

const RELOAD_KEY = 'flowmate:chunk-reload-count'
const MAX_RELOADS = 2

function isChunkLoadError(error: unknown): boolean {
  if (error instanceof Error) {
    return (
      error.message.includes('Failed to fetch dynamically imported module') ||
      error.message.includes('is not a valid JavaScript MIME type') ||
      error.message.includes('Importing a module script failed')
    )
  }
  return false
}

function getReloadCount(): number {
  return Number(sessionStorage.getItem(RELOAD_KEY) ?? '0')
}

function reloadWithCounter(): void {
  sessionStorage.setItem(RELOAD_KEY, String(getReloadCount() + 1))
  window.location.reload()
}

type RouteErrorBoundaryProps = {
  // 하단 탭이 있는 레이아웃 안에서 쓰면 그 영역 가운데에 둔다
  inLayout?: boolean
}

export default function RouteErrorBoundary({ inLayout = false }: RouteErrorBoundaryProps) {
  const error = useRouteError()
  const location = useLocation()
  const navigate = useNavigate()
  const isChunkError = isChunkLoadError(error)
  const canAutoReload = isChunkError && getReloadCount() < MAX_RELOADS
  const reloadTriggered = useRef(false)

  useEffect(() => {
    if (!isChunkError) {
      sessionStorage.removeItem(RELOAD_KEY)
      return
    }

    if (canAutoReload && !reloadTriggered.current) {
      reloadTriggered.current = true
      reloadWithCounter()
    } else if (!canAutoReload) {
      sessionStorage.removeItem(RELOAD_KEY)
    }
  }, [isChunkError, canAutoReload])

  if (isChunkError && canAutoReload) return null

  const placement = inLayout ? 'layout' : 'screen'

  if (isChunkError) {
    // 오프라인에서 화면 코드를 받지 못한 것은 업데이트가 아니라 연결 문제다
    const copy = navigator.onLine === false ? systemMessages.chunkOffline : systemMessages.appUpdated
    return (
      <SystemMessage
        placement={placement}
        title={copy.title}
        body={copy.body}
        primary={{ label: copy.action, onClick: reloadWithCounter }}
      />
    )
  }

  console.error('[RouteErrorBoundary]', error)

  return (
    <SystemMessage
      placement={placement}
      title={systemMessages.routeError.title}
      body={systemMessages.routeError.body}
      primary={{
        label: systemMessages.routeError.action,
        // 같은 주소로 다시 이동하면 에러 경계가 초기화되어 화면을 다시 그린다
        onClick: () => navigate(location, { replace: true, state: location.state }),
      }}
      // 앱을 처음부터 다시 연다(/는 계획으로 보낸다)
      secondary={{ label: systemMessages.goToPlan, onClick: () => window.location.assign('/') }}
    />
  )
}
