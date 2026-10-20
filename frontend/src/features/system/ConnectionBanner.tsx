import { useState } from 'react'
import { bannerMessages } from '../../lib/messages'
import { useOnlineStatus } from '../../lib/useOnlineStatus'
import { useSystemStore } from '../../store/systemStore'
import { TopBanner } from '../../ui/TopBanner'
import { recheckBackend } from './useBackendWatcher'

/**
 * 쓰던 중 연결이 끊겼을 때 화면을 바꾸지 않고 위에 띄우는 안내.
 * 오프라인이면 오프라인 문구, 서버만 끊겼으면 서버 문구를 보여 주고, 서버 문구는 누르면 바로 다시 확인한다.
 */
export function ConnectionBanner() {
  const online = useOnlineStatus()
  const status = useSystemStore((s) => s.status)
  const [checking, setChecking] = useState(false)

  if (!online) return <TopBanner message={bannerMessages.offline} />
  if (status !== 'unavailable') return null

  const handleRecheck = async () => {
    setChecking(true)
    try {
      await recheckBackend()
    } finally {
      setChecking(false)
    }
  }

  return (
    <TopBanner
      message={bannerMessages.serverDown}
      actionLabel={checking ? bannerMessages.rechecking : bannerMessages.recheck}
      onAction={handleRecheck}
      actionDisabled={checking}
    />
  )
}
