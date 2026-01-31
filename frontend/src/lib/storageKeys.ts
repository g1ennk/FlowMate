export const STORAGE_PREFIX = 'flowmate'
export const LEGACY_STORAGE_PREFIX = 'todo-flow'

export const storageKeys = {
  clientId: `${STORAGE_PREFIX}/client-id`,
  legacyClientId: `${LEGACY_STORAGE_PREFIX}/client-id`,
  todos: (clientId: string) => `${STORAGE_PREFIX}/${clientId}/todos`,
  settings: (clientId: string) => `${STORAGE_PREFIX}/${clientId}/settings`,
  timerPrefix: (clientId: string) => `${STORAGE_PREFIX}/${clientId}/timer/v2/`,
  sessionPrefix: (clientId: string) => `${STORAGE_PREFIX}/${clientId}/sessionHistory/`,
  legacyTodos: `${LEGACY_STORAGE_PREFIX}/todos`,
  legacySettings: `${LEGACY_STORAGE_PREFIX}/settings`,
  legacyTodosByClient: (clientId: string) => `${LEGACY_STORAGE_PREFIX}/${clientId}/todos`,
  legacySettingsByClient: (clientId: string) => `${LEGACY_STORAGE_PREFIX}/${clientId}/settings`,
  legacyTimerPrefix: `${LEGACY_STORAGE_PREFIX}/timer/v2/`,
  legacySessionPrefix: `${LEGACY_STORAGE_PREFIX}/sessionHistory/`,
  legacyTimerPrefixByClient: (clientId: string) =>
    `${LEGACY_STORAGE_PREFIX}/${clientId}/timer/v2/`,
  legacySessionPrefixByClient: (clientId: string) =>
    `${LEGACY_STORAGE_PREFIX}/${clientId}/sessionHistory/`,
}
