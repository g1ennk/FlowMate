import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { getAuthMode, hasSessionExpired } from '../lib/auth'
import { getOnboardingSeen } from '../lib/onboarding'
import { useAuthStore } from '../store/authStore'
import { systemMessages } from '../lib/messages'
import { SystemMessage } from '../ui/SystemMessage'
import AppLayout from './App'
import AppSplash from './AppSplash'

/**
 * 회원 세션 복원이 서버 오류로 실패한 화면. 로그인 화면으로 보내면 로그아웃된 것처럼 보이므로
 * 그대로 머물며 다시 시도하게 한다. 서버가 돌아오거나 앱이 다시 보이면 useAuthInitRetry도 다시 시도한다.
 * 계속 실패할 때 갇히지 않도록 로그인 화면으로 나가는 길도 둔다.
 */
function AuthRestoreFailed() {
  const navigate = useNavigate()
  const init = useAuthStore((s) => s.init)
  const [retrying, setRetrying] = useState(false)
  const copy = systemMessages.authRestoreFailed

  const handleRetry = async () => {
    setRetrying(true)
    try {
      await init()
    } finally {
      setRetrying(false)
    }
  }

  return (
    <SystemMessage
      title={copy.title}
      body={copy.body}
      primary={{ label: retrying ? copy.pending : copy.action, onClick: handleRetry, disabled: retrying }}
      secondary={{ label: copy.secondary, onClick: () => navigate('/login') }}
    />
  )
}

function AppLayoutGate() {
  const authState = useAuthStore((s) => s.state)
  const initialized = useAuthStore((s) => s.initialized)
  const seen = getOnboardingSeen()

  if (!seen) {
    return <Navigate to="/login" replace />
  }

  // init() 완료 전엔 스플래시 노출 (빈 화면 방지)
  if (!initialized) {
    return <AppSplash />
  }

  if (!authState) {
    // 회원 힌트가 남아 있는데 세션이 없으면 서버 오류로 복원하지 못한 것이다.
    // 진짜 만료(401/403)면 authStore가 힌트를 지우고 만료 표시를 남기므로 로그인 화면으로 간다.
    if (getAuthMode() === 'member' && !hasSessionExpired()) {
      return <AuthRestoreFailed />
    }
    return <Navigate to="/login" replace />
  }

  return <AppLayout />
}

export default AppLayoutGate
