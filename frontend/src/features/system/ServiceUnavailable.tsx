import { useState } from 'react'
import { MoonIcon } from '../../ui/Icons'
import { recheckBackend } from './useBackendWatcher'

function ServiceUnavailable() {
  const [checking, setChecking] = useState(false)

  const handleRecheck = async () => {
    setChecking(true)
    try {
      await recheckBackend()
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-surface-base">
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center px-6 py-10 text-center">
        <MoonIcon className="h-10 w-10 text-accent" />
        <h1 className="mt-6 text-xl font-bold text-text-primary">
          지금은 서버에 연결할 수 없어요
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-text-secondary">
          잠시 후 다시 확인해 주세요.
        </p>
        <button
          type="button"
          onClick={handleRecheck}
          disabled={checking}
          className="mt-8 rounded-full bg-surface-card px-5 py-2.5 text-sm font-medium text-text-secondary shadow-sm transition-colors hover:bg-hover-strong disabled:opacity-60"
        >
          {checking ? '확인 중...' : '다시 확인'}
        </button>
      </div>
    </div>
  )
}

export default ServiceUnavailable
