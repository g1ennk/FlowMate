import { create } from 'zustand'
import { buildApiUrl } from '../api/baseUrl'
import { clearAuthMode, getAuthMode, setAuthMode } from '../lib/auth'
import { storageKeys } from '../lib/storageKeys'
import type { AuthState } from '../types/auth'

interface AuthStore {
  state: AuthState | null
  initialized: boolean
  init: () => Promise<void>
  startGuest: () => Promise<void>
  login: (provider: string, code: string, stateToken: string) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
  getToken: () => string
}

let memberRefreshPromise: Promise<void> | null = null

export const useAuthStore = create<AuthStore>((set, get) => ({
  state: null,
  initialized: false,

  /**
   * 앱 초기화: authMode 힌트로 경로 분기.
   * - 과거에 회원으로 로그인한 적 없는 사용자(=authMode !== 'member')는
   *   /auth/refresh 호출을 건너뛰어 cold load 빈 화면을 단축한다.
   * - 회원 힌트가 있으면 refresh 시도, 실패 시 로그인 화면으로 유도한다.
   */
  init: async () => {
    const mode = getAuthMode()

    // 1. 회원 힌트가 있을 때만 refresh 시도
    if (mode === 'member') {
      try {
        await get().refresh()
      } catch {
        set({ state: null, initialized: true })
        return
      }
      set({ initialized: true })
      return
    }

    // 2. 게스트 토큰이 이미 있으면 즉시 사용 (API 호출 0회)
    const guestToken = localStorage.getItem(storageKeys.guestToken)
    if (guestToken) {
      setAuthMode('guest')
      set({ state: { type: 'guest', token: guestToken }, initialized: true })
      return
    }

    // 3. 없으면 새 게스트 토큰 발급
    try {
      await get().startGuest()
      set({ initialized: true })
    } catch {
      set({ initialized: true })
    }
  },

  /** 명시적 게스트 시작 */
  startGuest: async () => {
    const res = await fetch(buildApiUrl('/auth/guest/token'), { method: 'POST' })
    if (!res.ok) throw new Error('게스트 토큰 발급 실패')
    const data = await res.json()
    localStorage.setItem(storageKeys.guestToken, data.guestToken)
    setAuthMode('guest')
    set({ state: { type: 'guest', token: data.guestToken } })
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
    setAuthMode('member')
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
      await get().startGuest()
    } catch {
      // 게스트 토큰 발급 실패 시 상태를 null로 초기화 (로그인 페이지로 리다이렉트됨)
      localStorage.removeItem(storageKeys.guestToken)
      clearAuthMode()
      set({ state: null })
    }
  },

  /** Access Token 재발급 (401 인터셉터에서 호출) */
  refresh: async () => {
    const currentState = get().state
    const refreshStartedFromState = currentState

    if (currentState?.type === 'guest') {
      // 게스트는 새 토큰 재발급
      await get().startGuest()
      return
    }

    // 회원은 Refresh Token 쿠키로 재발급
    if (!memberRefreshPromise) {
      memberRefreshPromise = (async () => {
        const isStaleRefresh = () => get().state !== refreshStartedFromState
        const res = await fetch(buildApiUrl('/auth/refresh'), { method: 'POST', credentials: 'include' })
        if (!res.ok) {
          if (isStaleRefresh()) return
          // Refresh Token 만료/폐기 → 자동 서버 logout 없이 로컬 회원 세션만 종료한다.
          // stale /auth/refresh 자체는 여전히 BE reuse detection을 발동시킬 수 있지만,
          // FE가 실패 후 추가 /auth/logout을 보내는 벡터는 여기서 제거한다.
          localStorage.removeItem(storageKeys.guestToken)
          clearAuthMode()
          set({ state: null })
          return
        }
        const data = await res.json()
        if (isStaleRefresh()) return
        // accessToken은 메모리(state)에만 저장, user도 동기화
        set({ state: { type: 'member', accessToken: data.accessToken, user: data.user } })
      })().finally(() => {
        memberRefreshPromise = null
      })
    }
    return memberRefreshPromise
  },

  /** 현재 유효한 토큰 반환 (게스트/회원 구분 없이) */
  getToken: () => {
    const s = get().state
    if (!s) return ''
    return s.type === 'guest' ? s.token : s.accessToken
  },
}))
