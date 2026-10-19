import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { settingsApi } from '../../api/settings'
import {
  type MiniDaysSettings,
  type PomodoroSettings,
  type Settings,
} from '../../api/types'
import { queryKeys } from '../../lib/queryKeys'
import { defaultMiniDaysSettings, normalizeMiniDaysSettings } from '../../lib/miniDays'

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

// 설정 저장 요청은 한 줄로 세워 순서대로 보낸다.
// 서버는 PUT으로 통째로 덮어쓰므로, 요청이 겹치면 늦게 끝난 요청이 앞선 변경을 되돌릴 수 있다.
const settingsMutationKey = queryKeys.settings()
const settingsScope = { id: 'settings' }

const SESSION_KEYS = ['flowMin', 'breakMin', 'longBreakMin', 'cycleEvery'] as const
const AUTOMATION_KEYS = ['autoStartBreak', 'autoStartSession'] as const

function applyPomodoroPatch(settings: Settings, patch: Partial<PomodoroSettings>): Settings {
  const session = settings.pomodoroSession
  const automation = settings.automation
  return {
    ...settings,
    pomodoroSession: {
      flowMin: patch.flowMin ?? session.flowMin,
      breakMin: patch.breakMin ?? session.breakMin,
      longBreakMin: patch.longBreakMin ?? session.longBreakMin,
      cycleEvery: patch.cycleEvery ?? session.cycleEvery,
    },
    automation: {
      autoStartBreak: patch.autoStartBreak ?? automation.autoStartBreak,
      autoStartSession: patch.autoStartSession ?? automation.autoStartSession,
    },
  }
}

// onError/onSettled 시점에는 지금 끝나는 저장도 아직 진행 중으로 센다.
function isLastSettingsMutation(qc: QueryClient) {
  return qc.isMutating({ mutationKey: settingsMutationKey }) === 1
}

export function useUpdatePomodoroSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationKey: settingsMutationKey,
    scope: settingsScope,
    onMutate: async (patch: Partial<PomodoroSettings>) => {
      await qc.cancelQueries({ queryKey: queryKeys.settings() })
      const previous = qc.getQueryData<Settings>(queryKeys.settings())
      if (previous) {
        qc.setQueryData<Settings>(queryKeys.settings(), applyPomodoroPatch(previous, patch))
      }
      return { previous }
    },
    // 캐시에는 이미 화면에 보이는 최신 값이 들어 있다. 그 값을 그대로 보낸다.
    mutationFn: async (patch: Partial<PomodoroSettings>) => {
      const current = qc.getQueryData<Settings>(queryKeys.settings())
      // 설정을 불러오기 전에는 기본값으로 서버 값을 덮어쓰지 않도록 보내지 않는다.
      if (!current) throw new Error('settings not loaded')

      const touchesSession = SESSION_KEYS.some((key) => patch[key] !== undefined)
      const touchesAutomation = AUTOMATION_KEYS.some((key) => patch[key] !== undefined)
      await Promise.all([
        touchesSession ? settingsApi.updateSession(current.pomodoroSession) : null,
        touchesAutomation ? settingsApi.updateAutomation(current.automation) : null,
      ])
    },
    onError: (_error, _patch, context) => {
      // 뒤에 기다리는 저장이 있으면 그 저장이 최신 화면 값을 보내므로 되돌리지 않는다.
      if (context?.previous && isLastSettingsMutation(qc)) {
        qc.setQueryData(queryKeys.settings(), context.previous)
      }
      toast.error('설정을 저장하지 못했어요')
    },
    onSettled: () => {
      if (isLastSettingsMutation(qc)) {
        void qc.invalidateQueries({ queryKey: queryKeys.settings() })
      }
    },
  })
}

export function useUpdateMiniDaysSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationKey: settingsMutationKey,
    scope: settingsScope,
    mutationFn: (payload: MiniDaysSettings) => settingsApi.updateMiniDays(payload),
    onSuccess: (data) => {
      const normalized = normalizeMiniDaysSettings(data)
      qc.setQueryData(queryKeys.miniDaysSettings(), normalized)
      qc.setQueryData<Settings>(queryKeys.settings(), (old) =>
        old ? { ...old, miniDays: normalized } : old,
      )
    },
    onError: () => {
      toast.error('미니 데이를 저장하지 못했어요')
    },
  })
}
