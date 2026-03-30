import { useEffect, useRef } from 'react'
import { useRouteError } from 'react-router-dom'

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

export default function RouteErrorBoundary() {
  const error = useRouteError()
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

  if (isChunkError) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-surface-sunken">
          <svg
            className="h-8 w-8 text-accent"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182"
            />
          </svg>
        </div>
        <h1 className="mb-1 text-lg font-semibold text-text-primary">
          앱이 업데이트되었어요
        </h1>
        <p className="mb-6 text-sm text-text-secondary">
          새 버전이 배포되어 페이지를 새로고침해야 합니다.
        </p>
        <button
          onClick={reloadWithCounter}
          className="rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-text-inverse transition-colors hover:bg-accent-hover"
        >
          새로고침
        </button>
      </div>
    )
  }

  console.error('[RouteErrorBoundary]', error)

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-surface-sunken">
        <svg
          className="h-8 w-8 text-text-tertiary"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
          />
        </svg>
      </div>
      <h1 className="mb-1 text-lg font-semibold text-text-primary">
        오류가 발생했어요
      </h1>
      <p className="mb-6 max-w-xs text-sm text-text-secondary">
        잠시 후 다시 시도해주세요
      </p>
      <button
        onClick={() => window.location.assign('/')}
        className="rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-text-inverse transition-colors hover:bg-accent-hover"
      >
        홈으로 돌아가기
      </button>
    </div>
  )
}
