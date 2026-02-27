import { create } from 'zustand'
import { buildApiUrl } from '../api/baseUrl'
import { storageKeys } from '../lib/storageKeys'
import type { AuthState } from '../types/auth'

interface AuthStore {
  state: AuthState | null
  initialized: boolean
  init: () => Promise<void>
  login: (provider: string, code: string, stateToken: string) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
  getToken: () => string
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  state: null,
  initialized: false,

  /** 앱 초기화: refresh token 쿠키로 복원 또는 새 게스트 토큰 발급 */
  init: async () => {
    // 1. refresh token 쿠키로 access token + user 재발급 시도
    try {
      const res = await fetch(buildApiUrl('/auth/refresh'), { method: 'POST', credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        set({ state: { type: 'member', accessToken: data.accessToken, user: data.user }, initialized: true })
        return
      }
    } catch {
      // refresh 실패 시 게스트로 fallback
    }

    // 2. 게스트 토큰 확인
    const guestToken = localStorage.getItem(storageKeys.guestToken)
    if (guestToken) {
      set({ state: { type: 'guest', token: guestToken }, initialized: true })
      return
    }

    // 3. 없으면 새 게스트 토큰 발급
    try {
      const res = await fetch(buildApiUrl('/auth/guest/token'), { method: 'POST' })
      const data = await res.json()
      localStorage.setItem(storageKeys.guestToken, data.guestToken)
      set({ state: { type: 'guest', token: data.guestToken }, initialized: true })
    } catch {
      set({ initialized: true })
    }
  },

  /** 소셜 로그인 */
  login: async (provider, code, stateToken) => {
    const res = await fetch(buildApiUrl(`/auth/${provider}/exchange`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ code, state: stateToken }),
    })
    if (!res.ok) throw new Error('로그인 실패')

    const data = await res.json()
    // accessToken, user 모두 메모리(state)에만 저장
    localStorage.removeItem(storageKeys.guestToken)
    set({ state: { type: 'member', accessToken: data.accessToken, user: data.user } })
  },

  /** 로그아웃 */
  logout: async () => {
    try {
      await fetch(buildApiUrl('/auth/logout'), { method: 'POST', credentials: 'include' })
    } catch {
      // 로그아웃 API 실패해도 로컬 상태 초기화 진행
    }

    // 새 게스트 토큰 발급
    try {
      const res = await fetch(buildApiUrl('/auth/guest/token'), { method: 'POST' })
      const data = await res.json()
      localStorage.setItem(storageKeys.guestToken, data.guestToken)
      set({ state: { type: 'guest', token: data.guestToken } })
    } catch {
      // 게스트 토큰 발급 실패 시 상태를 null로 초기화 (로그인 페이지로 리다이렉트됨)
      localStorage.removeItem(storageKeys.guestToken)
      set({ state: null })
    }
  },

  /** Access Token 재발급 (401 인터셉터에서 호출) */
  refresh: async () => {
    const currentState = get().state

    if (currentState?.type === 'guest') {
      // 게스트는 새 토큰 재발급
      const res = await fetch(buildApiUrl('/auth/guest/token'), { method: 'POST' })
      const data = await res.json()
      localStorage.setItem(storageKeys.guestToken, data.guestToken)
      set({ state: { type: 'guest', token: data.guestToken } })
      return
    }

    // 회원은 Refresh Token 쿠키로 재발급
    const res = await fetch(buildApiUrl('/auth/refresh'), { method: 'POST', credentials: 'include' })
    if (!res.ok) {
      // Refresh Token 만료 → 세션 종료. 게스트 전환이 아닌 로그인 페이지로 유도
      // (logout()은 게스트 토큰을 발급해 state: guest로 세팅하므로 여기서는 직접 null 처리)
      try {
        await fetch(buildApiUrl('/auth/logout'), { method: 'POST', credentials: 'include' })
      } catch {
        // 서버 revoke 실패는 무시 (어차피 토큰이 만료됨)
      }
      localStorage.removeItem(storageKeys.guestToken)
      set({ state: null })
      return
    }
    const data = await res.json()
    // accessToken은 메모리(state)에만 저장, user도 동기화
    set((s) =>
      s.state?.type === 'member'
        ? { state: { ...s.state, accessToken: data.accessToken, user: data.user } }
        : s,
    )
  },

  /** 현재 유효한 토큰 반환 (게스트/회원 구분 없이) */
  getToken: () => {
    const s = get().state
    if (!s) return ''
    return s.type === 'guest' ? s.token : s.accessToken
  },
}))
