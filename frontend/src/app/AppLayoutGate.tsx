import { Navigate } from 'react-router-dom'
import { getOnboardingSeen } from '../lib/onboarding'
import { useAuthStore } from '../store/authStore'
import AppLayout from './App'
import AppSplash from './AppSplash'

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
    return <Navigate to="/login" replace />
  }

  return <AppLayout />
}

export default AppLayoutGate
