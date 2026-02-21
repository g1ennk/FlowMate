import { Navigate } from 'react-router-dom'
import { getOnboardingSeen } from '../lib/onboarding'
import AppLayout from './App'

function AppLayoutGate() {
  const seen = getOnboardingSeen()
  if (!seen) {
    return <Navigate to="/boarding" replace />
  }
  return <AppLayout />
}

export default AppLayoutGate
