import { api } from './http'
import { PomodoroSettingsSchema, type PomodoroSettings } from './types'

export const settingsApi = {
  get: (): Promise<PomodoroSettings> => api.get('/settings/pomodoro', PomodoroSettingsSchema),
  update: (body: PomodoroSettings): Promise<PomodoroSettings> =>
    api.put('/settings/pomodoro', body, PomodoroSettingsSchema),
}
