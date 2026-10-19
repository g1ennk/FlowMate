import { useEffect } from 'react'
import { getAuthMode } from '../lib/auth'
import { useAuthStore } from '../store/authStore'
import { useSystemStore } from '../store/systemStore'

/**
 * 콜드 스타트에서 회원 세션 복원(init)이 서버 오류로 실패했을 때 다시 시도한다.
 * 헬스체크가 실패했다가 다시 성공하거나 앱이 다시 화면에 보일 때,
 * 첫 init이 이미 끝났는데 세션이 없고 회원 힌트가 남아 있으면 init()을 한 번 더 부른다.
 * 첫 init이 진행 중일 때는 부르지 않는다 — /auth/refresh가 이중으로 나가면 RTR 재사용 탐지에 걸릴 수 있다.
 */
export function useAuthInitRetry(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return

    const retry = () => {
      const { initialized, state, init } = useAuthStore.getState()
      if (initialized && state === null && getAuthMode() === 'member') void init()
    }

    // 실패 1회는 status를 바꾸지 않으므로, status 전이 대신 "실패 후 첫 성공"을 본다
    const unsubscribe = useSystemStore.subscribe((current, previous) => {
      if (previous.failures > 0 && current.failures === 0 && current.status === 'available') retry()
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
