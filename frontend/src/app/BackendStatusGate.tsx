import type { PropsWithChildren } from 'react'
import { useSystemStore } from '../store/systemStore'
import { useBackendWatcher } from '../features/system/useBackendWatcher'
import ServiceUnavailable from '../features/system/ServiceUnavailable'

function BackendStatusGate({ children }: PropsWithChildren) {
  useBackendWatcher()
  const status = useSystemStore((s) => s.status)

  if (status === 'unknown') return null
  if (status === 'unavailable') return <ServiceUnavailable />
  return <>{children}</>
}

export default BackendStatusGate
