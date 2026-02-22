import { storageKeys } from './storageKeys'

export type AuthMode = 'guest' | 'kakao'

let volatileAuthMode: AuthMode | null = null

export function getAuthMode(): AuthMode | null {
  if (typeof window === 'undefined') return volatileAuthMode
  try {
    const value = localStorage.getItem(storageKeys.authMode)
    if (value === 'guest' || value === 'kakao') return value
    return volatileAuthMode
  } catch {
    return volatileAuthMode
  }
}

export function setAuthMode(mode: AuthMode) {
  volatileAuthMode = mode
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(storageKeys.authMode, mode)
  } catch {
    // localStorage 접근 실패는 무시한다.
  }
}

export function clearAuthMode() {
  volatileAuthMode = null
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(storageKeys.authMode)
  } catch {
    // localStorage 접근 실패는 무시한다.
  }
}
