export const STORAGE_PREFIX = 'flowmate'

export const storageKeys = {
  // 인증
  guestToken: `${STORAGE_PREFIX}/auth/guest-token`,
  // accessToken, authUser는 메모리(Zustand state)에만 저장 — localStorage 사용 안 함
  // 온보딩
  onboardingSeen: `${STORAGE_PREFIX}/onboarding/seen`,
  // 기존 (clientId 기반 — 폐기 예정)
  clientId: `${STORAGE_PREFIX}/client-id`,
  authMode: `${STORAGE_PREFIX}/auth/mode`,
  // 도메인 캐시
  todos: (clientId: string) => `${STORAGE_PREFIX}/${clientId}/todos`,
  settings: (clientId: string) => `${STORAGE_PREFIX}/${clientId}/settings`,
  reviews: (clientId: string) => `${STORAGE_PREFIX}/${clientId}/reviews`,
  pomodoroSessionSettings: (clientId: string) =>
    `${STORAGE_PREFIX}/${clientId}/settings/pomodoroSession`,
  automationSettings: (clientId: string) => `${STORAGE_PREFIX}/${clientId}/settings/automation`,
  miniDaysSettings: (clientId: string) => `${STORAGE_PREFIX}/${clientId}/settings/miniDays`,
  sharedMiniDaysSettings: `${STORAGE_PREFIX}/settings/miniDays`,
  timersKey: (clientId: string) => `${STORAGE_PREFIX}/${clientId}/timers`,
  sessionsPrefix: (clientId: string) => `${STORAGE_PREFIX}/${clientId}/sessions/`,
  sessionsSyncKey: (clientId: string) => `${STORAGE_PREFIX}/${clientId}/sessions/sync`,
  autoSessionsSyncKey: (clientId: string) => `${STORAGE_PREFIX}/${clientId}/sessions/auto-sync`,
}
