import { Navigate } from 'react-router-dom'
import { getOnboardingSeen } from '../lib/onboarding'
import { useAuthStore } from '../store/authStore'
import AppLayout from './App'

function AppLayoutGate() {
  const authState = useAuthStore((s) => s.state)
  const initialized = useAuthStore((s) => s.initialized)
  const seen = getOnboardingSeen()

  if (!seen) {
    return <Navigate to="/boarding" replace />
  }

  // init() 완료 전엔 아무것도 렌더링하지 않음
  if (!initialized) {
    return null
  }

  if (!authState) {
    return <Navigate to="/login" replace />
  }

  return <AppLayout />
}

export default AppLayoutGate
