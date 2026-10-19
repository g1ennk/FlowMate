import { useEffect } from 'react'
import { getAuthMode } from '../lib/auth'
import { useAuthStore } from '../store/authStore'
import { useSystemStore } from '../store/systemStore'

/**
 * 콜드 스타트에서 회원 세션 복원(init)이 서버 오류로 실패했을 때 다시 시도한다.
 * 백엔드가 available로 돌아오거나 앱이 다시 화면에 보일 때,
 * 아직 세션이 없고 회원 힌트가 남아 있으면 init()을 한 번 더 부른다.
 */
export function useAuthInitRetry(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return

    const retry = () => {
      const { state, init } = useAuthStore.getState()
      if (state === null && getAuthMode() === 'member') void init()
    }

    const unsubscribe = useSystemStore.subscribe((current, previous) => {
      if (current.status === 'available' && previous.status !== 'available') retry()
    })
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') retry()
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      unsubscribe()
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [enabled])
}
