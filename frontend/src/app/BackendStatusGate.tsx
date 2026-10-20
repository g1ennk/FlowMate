import { useState, type PropsWithChildren } from 'react'
import { useSystemStore } from '../store/systemStore'
import { useBackendWatcher } from '../features/system/useBackendWatcher'
import ServiceUnavailable from '../features/system/ServiceUnavailable'
import { ConnectionBanner } from '../features/system/ConnectionBanner'
import { OverlayInertRoot } from '../ui/OverlayInertRoot'
import { useOnlineStatus } from '../lib/useOnlineStatus'
import AppSplash from './AppSplash'

function BackendStatusGate({ children }: PropsWithChildren) {
  useBackendWatcher()
  const status = useSystemStore((s) => s.status)
  const online = useOnlineStatus()
  // 앱을 한 번 보여준 뒤에는 라우터를 다시 내리지 않는다 (입력 중인 글과 시트를 지킨다)
  const [appShown, setAppShown] = useState(false)

  if (!appShown) {
    // 오프라인이면 앱을 보여 주고 ConnectionBanner가 안내한다
    if (online && status === 'unknown') return <AppSplash />
    // 처음 진입부터 서버가 없을 때만 전체 화면
    if (online && status === 'unavailable') return <ServiceUnavailable />
    setAppShown(true)
  }

  // 배너는 시트가 열려 있어도 누를 수 있도록 inert가 되는 앱 화면 바깥에 둔다
  return (
    <>
      <ConnectionBanner />
      <OverlayInertRoot>{children}</OverlayInertRoot>
    </>
  )
}

export default BackendStatusGate
