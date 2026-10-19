import type { PropsWithChildren } from 'react'
import { useSystemStore } from '../store/systemStore'
import { useBackendWatcher } from '../features/system/useBackendWatcher'
import ServiceUnavailable from '../features/system/ServiceUnavailable'
import ServerDisconnectedBanner from '../features/system/ServerDisconnectedBanner'
import { useOnlineStatus } from '../lib/useOnlineStatus'
import AppSplash from './AppSplash'

function BackendStatusGate({ children }: PropsWithChildren) {
  useBackendWatcher()
  const status = useSystemStore((s) => s.status)
  const hasConnected = useSystemStore((s) => s.hasConnected)
  const online = useOnlineStatus()

  if (status === 'unknown') return <AppSplash />

  // 오프라인은 앱 안의 OfflineBanner가 안내한다
  const disconnected = status === 'unavailable' && online
  // 처음부터 서버가 없을 때만 전체 화면. 쓰던 중이면 라우터를 유지해 입력 중인 내용을 지킨다
  if (disconnected && !hasConnected) return <ServiceUnavailable />

  return (
    <>
      {disconnected ? <ServerDisconnectedBanner /> : null}
      {children}
    </>
  )
}

export default BackendStatusGate
