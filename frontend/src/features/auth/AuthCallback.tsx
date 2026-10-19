import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuthStore } from '../../store/authStore'
import { queryClient } from '../../app/queryClient'
import { storageKeys } from '../../lib/storageKeys'

const LOGIN_FAILED_MESSAGE = '로그인하지 못했어요. 다시 시도해 주세요'

function AuthCallback() {
  const navigate = useNavigate()
  const login = useAuthStore((s) => s.login)
  const called = useRef(false)

  useEffect(() => {
    // StrictMode 이중 실행 방지
    if (called.current) return
    called.current = true

    const run = async () => {
      const params = new URLSearchParams(window.location.search)
      const code = params.get('code')
      const stateFromUrl = params.get('state')
      const stateFromStorage = sessionStorage.getItem('oauth_state')
      const provider = sessionStorage.getItem('oauth_provider') ?? 'kakao'

      // 카카오 동의 화면에서 취소하면 code 대신 error=access_denied로 돌아온다
      if (params.get('error') === 'access_denied') {
        sessionStorage.removeItem('oauth_state')
        sessionStorage.removeItem('oauth_provider')
        toast('로그인을 취소했어요')
        navigate('/login', { replace: true })
        return
      }

      // state 검증
      if (!code || !stateFromUrl || stateFromUrl !== stateFromStorage) {
        console.error('[AuthCallback] state 불일치 또는 code 없음')
        toast.error(LOGIN_FAILED_MESSAGE)
        navigate('/login', { replace: true })
        return
      }

      sessionStorage.removeItem('oauth_state')
      sessionStorage.removeItem('oauth_provider')

      try {
        await login(provider, code, stateFromUrl)
        queryClient.clear()
        const returnTo = sessionStorage.getItem(storageKeys.oauthReturnTo) || '/todos'
        sessionStorage.removeItem(storageKeys.oauthReturnTo)
        navigate(returnTo, { replace: true })
      } catch (e) {
        console.error('[AuthCallback] 로그인 실패', e)
        toast.error(LOGIN_FAILED_MESSAGE)
        navigate('/login', { replace: true })
      }
    }

    run()
  }, [login, navigate])

  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface-card">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        <p className="text-sm text-text-secondary">로그인 처리 중...</p>
      </div>
    </div>
  )
}

export default AuthCallback
