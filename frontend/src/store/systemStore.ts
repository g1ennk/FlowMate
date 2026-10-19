import { create } from 'zustand'

export type BackendStatus = 'unknown' | 'available' | 'unavailable'

// 일시적인 네트워크 흔들림으로 화면이 바뀌지 않도록 연속 실패만 장애로 본다
const FAILURE_THRESHOLD = 2

interface SystemStore {
  status: BackendStatus
  /** 연속 실패 횟수. 성공하면 0으로 돌아간다 */
  failures: number
  recordHealth: (ok: boolean) => void
}

export const useSystemStore = create<SystemStore>((set) => ({
  status: 'unknown',
  failures: 0,
  recordHealth: (ok) =>
    set((state) => {
      if (ok) return { status: 'available', failures: 0 }
      const failures = state.failures + 1
      return {
        failures,
        status: failures >= FAILURE_THRESHOLD ? 'unavailable' : state.status,
      }
    }),
}))
