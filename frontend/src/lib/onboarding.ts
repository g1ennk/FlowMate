import { storageKeys } from './storageKeys'

const STORAGE_KEY = storageKeys.onboardingSeen

export function getOnboardingSeen() {
  if (typeof window === 'undefined') return true
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return true
  }
}

export function setOnboardingSeen(value = true) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, value ? 'true' : 'false')
  } catch {
    // ignore storage errors to avoid blocking access
  }
}
