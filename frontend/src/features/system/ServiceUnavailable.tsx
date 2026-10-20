import { useState } from 'react'
import { systemMessages } from '../../lib/messages'
import { SystemMessage } from '../../ui/SystemMessage'
import { recheckBackend } from './useBackendWatcher'

/** 처음 들어올 때부터 서버가 없을 때의 전체 화면. useBackendWatcher가 계속 다시 확인하고, 연결되면 앱이 열린다 */
function ServiceUnavailable() {
  const [checking, setChecking] = useState(false)
  const copy = systemMessages.serviceUnavailable

  const handleRecheck = async () => {
    setChecking(true)
    try {
      await recheckBackend()
    } finally {
      setChecking(false)
    }
  }

  return (
    <SystemMessage
      title={copy.title}
      body={copy.body}
      primary={{ label: checking ? copy.pending : copy.action, onClick: handleRecheck, disabled: checking }}
    />
  )
}

export default ServiceUnavailable
