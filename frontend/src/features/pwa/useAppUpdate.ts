import { useEffect } from 'react'
import { useTimerStore } from '../timer/timerStore'
import { appUpdater } from './appUpdate'

// 당겨서 새로고침 시 새 버전 활성화를 기다리는 최대 시간
const UPDATE_WAIT_MS = 5000

// 실행 중인 타이머(음악, 완료 모달 포함)를 reload로 끊지 않는다
const hasRunningTimer = () =>
  Object.values(useTimerStore.getState().timers).some((timer) => timer.status === 'running')

/** 당겨서 새로고침용 — 새 버전이 있으면 활성화를 기다렸다가 바로 적용한다. */
export async function checkAndApplyUpdate() {
  const hasUpdate = await appUpdater.check({ waitMs: UPDATE_WAIT_MS })
  if (hasUpdate && !hasRunningTimer()) appUpdater.applyUpdate()
}

/**
 * 앱 복귀 시: 이전에 받아둔 새 버전이 있으면 적용하고, 없으면 확인만 해 둔다.
 * 확인 직후 바로 reload하지 않는 이유 — 복귀 몇 초 뒤 사용자가 입력 중일 수 있다.
 */
export function useAppUpdate() {
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return
      if (!hasRunningTimer() && appUpdater.applyUpdate()) return
      void appUpdater.check()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])
}
