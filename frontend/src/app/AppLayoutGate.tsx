import { Navigate } from 'react-router-dom'
import { getAuthMode } from '../lib/auth'
import { getOnboardingSeen } from '../lib/onboarding'
import AppLayout from './App'

function AppLayoutGate() {
  const seen = getOnboardingSeen()
  if (!seen) {
    return <Navigate to="/boarding" replace />
  }
  const authMode = getAuthMode()
  if (!authMode) {
    return <Navigate to="/login" replace />
  }
  return <AppLayout />
}

export default AppLayoutGate
