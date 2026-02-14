import { api } from './http'
import {
  AutomationSettingsSchema,
  MiniDaysSettingsSchema,
  PomodoroSessionSettingsSchema,
  SettingsSchema,
  type AutomationSettings,
  type MiniDaysSettings,
  type PomodoroSessionSettings,
  type Settings,
} from './types'

export const settingsApi = {
  getSettings: (): Promise<Settings> => api.get('/settings', SettingsSchema),
  updateSession: (body: PomodoroSessionSettings): Promise<PomodoroSessionSettings> =>
    api.put('/settings/pomodoro-session', body, PomodoroSessionSettingsSchema),
  updateAutomation: (body: AutomationSettings): Promise<AutomationSettings> =>
    api.put('/settings/automation', body, AutomationSettingsSchema),
  getMiniDays: (): Promise<MiniDaysSettings> =>
    api.get('/settings/mini-days', MiniDaysSettingsSchema),
  updateMiniDays: (body: MiniDaysSettings): Promise<MiniDaysSettings> =>
    api.put('/settings/mini-days', body, MiniDaysSettingsSchema),
}
