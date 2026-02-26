import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { queryClient } from '../../app/queryClient'

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

      // state 검증
      if (!code || !stateFromUrl || stateFromUrl !== stateFromStorage) {
        console.error('[AuthCallback] state 불일치 또는 code 없음')
        navigate('/login', { replace: true })
        return
      }

      sessionStorage.removeItem('oauth_state')
      sessionStorage.removeItem('oauth_provider')

      try {
        await login(provider, code, stateFromUrl)
        queryClient.clear()
        navigate('/todos', { replace: true })
      } catch (e) {
        console.error('[AuthCallback] 로그인 실패', e)
        navigate('/login', { replace: true })
      }
    }

    run()
  }, [login, navigate])

  return (
    <div className="flex min-h-dvh items-center justify-center bg-white">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
        <p className="text-sm text-gray-500">로그인 처리 중...</p>
      </div>
    </div>
  )
}

export default AuthCallback
