import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { settingsApi } from '../../api/settings'
import {
  type AutomationSettings,
  type MiniDaysSettings,
  type PomodoroSessionSettings,
  type PomodoroSettings,
} from '../../api/types'
import { queryKeys } from '../../lib/queryKeys'
import { defaultMiniDaysSettings, normalizeMiniDaysSettings } from '../../lib/miniDays'

export function useSettings() {
  return useQuery({
    queryKey: queryKeys.settings(),
    queryFn: () => settingsApi.getSettings(),
  })
}

export function usePomodoroSessionSettings() {
  return useQuery({
    queryKey: queryKeys.pomodoroSessionSettings(),
    queryFn: () => settingsApi.getSession(),
  })
}

export function useAutomationSettings() {
  return useQuery({
    queryKey: queryKeys.automationSettings(),
    queryFn: () => settingsApi.getAutomation(),
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
  const session = usePomodoroSessionSettings()
  const automation = useAutomationSettings()

  const data =
    session.data && automation.data
      ? {
          ...session.data,
          autoStartBreak: automation.data.autoStartBreak ?? false,
          autoStartSession: automation.data.autoStartSession ?? false,
        }
      : undefined

  return {
    data,
    isLoading: session.isLoading || automation.isLoading,
    isError: session.isError || automation.isError,
    error: session.error ?? automation.error,
  }
}

export function useUpdatePomodoroSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: PomodoroSettings) => {
      const sessionPayload: PomodoroSessionSettings = {
        flowMin: payload.flowMin,
        breakMin: payload.breakMin,
        longBreakMin: payload.longBreakMin,
        cycleEvery: payload.cycleEvery,
      }
      const automationPayload: AutomationSettings = {
        autoStartBreak: payload.autoStartBreak ?? false,
        autoStartSession: payload.autoStartSession ?? false,
      }
      const [session, automation] = await Promise.all([
        settingsApi.updateSession(sessionPayload),
        settingsApi.updateAutomation(automationPayload),
      ])
      return { ...session, ...automation }
    },
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.pomodoroSessionSettings(), {
        flowMin: data.flowMin,
        breakMin: data.breakMin,
        longBreakMin: data.longBreakMin,
        cycleEvery: data.cycleEvery,
      })
      qc.setQueryData(queryKeys.automationSettings(), {
        autoStartBreak: data.autoStartBreak ?? false,
        autoStartSession: data.autoStartSession ?? false,
      })
    },
  })
}

export function useUpdateMiniDaysSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: MiniDaysSettings) => settingsApi.updateMiniDays(payload),
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.miniDaysSettings(), normalizeMiniDaysSettings(data))
    },
  })
}
