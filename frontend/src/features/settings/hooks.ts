import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { settingsApi } from '../../api/settings'
import {
  type AutomationSettings,
  type MiniDaysSettings,
  type PomodoroSessionSettings,
  type PomodoroSettings,
  type Settings,
} from '../../api/types'
import { queryKeys } from '../../lib/queryKeys'
import { defaultMiniDaysSettings, normalizeMiniDaysSettings } from '../../lib/miniDays'
import { DEFAULT_SESSION_SETTINGS } from '../timer/timerDefaults'

export function useSettings() {
  return useQuery({
    queryKey: queryKeys.settings(),
    queryFn: async () => {
      const settings = await settingsApi.getSettings()
      return {
        ...settings,
        automation: {
          autoStartBreak: settings.automation.autoStartBreak,
          autoStartSession: settings.automation.autoStartSession,
        },
        miniDays: normalizeMiniDaysSettings(settings.miniDays),
      } satisfies Settings
    },
  })
}

export function useMiniDaysSettings() {
  return useQuery({
    queryKey: queryKeys.miniDaysSettings(),
    queryFn: () => settingsApi.getMiniDays().then((data) => normalizeMiniDaysSettings(data)),
    placeholderData: defaultMiniDaysSettings,
  })
}

export function usePomodoroSettings() {
  const settings = useSettings()

  const data =
    settings.data
      ? {
          ...settings.data.pomodoroSession,
          autoStartBreak: settings.data.automation.autoStartBreak,
          autoStartSession: settings.data.automation.autoStartSession,
        }
      : undefined

  return {
    data,
    isLoading: settings.isLoading,
    isError: settings.isError,
    error: settings.error,
  }
}

export function useUpdatePomodoroSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (patch: Partial<PomodoroSettings>) => {
      const current = qc.getQueryData<Settings>(queryKeys.settings())
      const currentSession = current?.pomodoroSession ?? DEFAULT_SESSION_SETTINGS
      const currentAutomation: Required<AutomationSettings> = {
        autoStartBreak: current?.automation.autoStartBreak ?? false,
        autoStartSession: current?.automation.autoStartSession ?? false,
      }

      const nextSession: PomodoroSessionSettings = {
        flowMin: patch.flowMin ?? currentSession.flowMin,
        breakMin: patch.breakMin ?? currentSession.breakMin,
        longBreakMin: patch.longBreakMin ?? currentSession.longBreakMin,
        cycleEvery: patch.cycleEvery ?? currentSession.cycleEvery,
      }

      const nextAutomation: Required<AutomationSettings> = {
        autoStartBreak: patch.autoStartBreak ?? currentAutomation.autoStartBreak,
        autoStartSession: patch.autoStartSession ?? currentAutomation.autoStartSession,
      }

      const sessionChanged =
        (patch.flowMin !== undefined && patch.flowMin !== currentSession.flowMin) ||
        (patch.breakMin !== undefined && patch.breakMin !== currentSession.breakMin) ||
        (patch.longBreakMin !== undefined && patch.longBreakMin !== currentSession.longBreakMin) ||
        (patch.cycleEvery !== undefined && patch.cycleEvery !== currentSession.cycleEvery)

      const automationChanged =
        (patch.autoStartBreak !== undefined && patch.autoStartBreak !== currentAutomation.autoStartBreak) ||
        (patch.autoStartSession !== undefined &&
          patch.autoStartSession !== currentAutomation.autoStartSession)

      const [session, automation] = await Promise.all([
        sessionChanged
          ? settingsApi.updateSession(nextSession)
          : Promise.resolve(currentSession),
        automationChanged
          ? settingsApi.updateAutomation(nextAutomation)
          : Promise.resolve(currentAutomation),
      ])

      return {
        session,
        automation: {
          autoStartBreak: automation.autoStartBreak,
          autoStartSession: automation.autoStartSession,
        },
      }
    },
    onSuccess: (data) => {
      qc.setQueryData<Settings>(queryKeys.settings(), (old) => ({
        pomodoroSession: data.session,
        automation: {
          autoStartBreak: data.automation.autoStartBreak,
          autoStartSession: data.automation.autoStartSession,
        },
        miniDays: normalizeMiniDaysSettings(old?.miniDays ?? defaultMiniDaysSettings),
      }))
    },
  })
}

export function useUpdateMiniDaysSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: MiniDaysSettings) => settingsApi.updateMiniDays(payload),
    onSuccess: (data) => {
      const normalized = normalizeMiniDaysSettings(data)
      qc.setQueryData(queryKeys.miniDaysSettings(), normalized)
      qc.setQueryData<Settings>(queryKeys.settings(), (old) => ({
        pomodoroSession: old?.pomodoroSession ?? DEFAULT_SESSION_SETTINGS,
        automation: {
          autoStartBreak: old?.automation.autoStartBreak ?? false,
          autoStartSession: old?.automation.autoStartSession ?? false,
        },
        miniDays: normalized,
      }))
    },
  })
}
