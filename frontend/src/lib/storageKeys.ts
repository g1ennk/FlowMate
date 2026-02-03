export const STORAGE_PREFIX = 'flowmate'

export const storageKeys = {
  clientId: `${STORAGE_PREFIX}/client-id`,
  onboardingSeen: `${STORAGE_PREFIX}/onboarding/seen`,
  todos: (clientId: string) => `${STORAGE_PREFIX}/${clientId}/todos`,
  settings: (clientId: string) => `${STORAGE_PREFIX}/${clientId}/settings`,
  reviews: (clientId: string) => `${STORAGE_PREFIX}/${clientId}/reviews`,
  pomodoroSessionSettings: (clientId: string) =>
    `${STORAGE_PREFIX}/${clientId}/settings/pomodoroSession`,
  automationSettings: (clientId: string) => `${STORAGE_PREFIX}/${clientId}/settings/automation`,
  miniDaysSettings: (clientId: string) => `${STORAGE_PREFIX}/${clientId}/settings/miniDays`,
  sharedMiniDaysSettings: `${STORAGE_PREFIX}/settings/miniDays`,
  timerPrefix: (clientId: string) => `${STORAGE_PREFIX}/${clientId}/timer/v2/`,
  sessionsPrefix: (clientId: string) => `${STORAGE_PREFIX}/${clientId}/sessions/`,
}
