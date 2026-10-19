import { useRef } from 'react'
import {
  type QueryClient,
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
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

// 설정 저장 요청은 한 줄로 세워 순서대로 보낸다(scope).
// 서버는 PUT으로 통째로 덮어쓰므로, 요청이 겹치면 늦게 끝난 요청이 앞선 변경을 되돌릴 수 있다.
const settingsScope = { id: 'settings' }
const pomodoroSaveKey = ['settings', 'pomodoro'] as const
const miniDaysSaveKey = ['settings', 'miniDays'] as const

// 저장할 묶음의 전체 값. 탭한 순간 화면에 보이던 값으로 확정해 그대로 보낸다.
export type PomodoroSettingsSave = {
  pomodoroSession?: PomodoroSessionSettings
  automation?: AutomationSettings
}

const SESSION_KEYS = ['flowMin', 'breakMin', 'longBreakMin', 'cycleEvery'] as const
const AUTOMATION_KEYS = ['autoStartBreak', 'autoStartSession'] as const

export function buildPomodoroSave(
  current: Settings,
  patch: Partial<PomodoroSettings>,
): PomodoroSettingsSave {
  const save: PomodoroSettingsSave = {}
  if (SESSION_KEYS.some((key) => patch[key] !== undefined)) {
    const session = current.pomodoroSession
    save.pomodoroSession = {
      flowMin: patch.flowMin ?? session.flowMin,
      breakMin: patch.breakMin ?? session.breakMin,
      longBreakMin: patch.longBreakMin ?? session.longBreakMin,
      cycleEvery: patch.cycleEvery ?? session.cycleEvery,
    }
  }
  if (AUTOMATION_KEYS.some((key) => patch[key] !== undefined)) {
    const automation = current.automation
    save.automation = {
      autoStartBreak: patch.autoStartBreak ?? automation.autoStartBreak,
      autoStartSession: patch.autoStartSession ?? automation.autoStartSession,
    }
  }
  return save
}

export function useSettings() {
  const query = useQuery({
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
  // 아직 저장 중인 값은 서버 값 위에 순서대로 덮어 보여준다.
  // 캐시를 직접 고치지 않으므로 중간에 refetch가 와도 화면이 되돌아가지 않고, 실패하면 저절로 원래 값이 보인다.
  const pendingSaves = useMutationState({
    filters: { mutationKey: pomodoroSaveKey, status: 'pending' },
    select: (mutation) => mutation.state.variables as PomodoroSettingsSave,
  })
  const data = query.data && pendingSaves.reduce<Settings>(
    (settings, save) => ({ ...settings, ...save }),
    query.data,
  )
  return { ...query, data }
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

// onSettled 시점에는 지금 끝나는 저장도 아직 진행 중으로 센다.
function isLastPomodoroSave(qc: QueryClient) {
  return qc.isMutating({ mutationKey: pomodoroSaveKey }) === 1
}

export function useUpdatePomodoroSettings() {
  const qc = useQueryClient()
  // 이어진 저장 묶음에서 끝내 저장되지 못한 묶음. 뒤 저장이 같은 묶음을 통째로 보내 성공하면 지운다.
  const failedGroups = useRef(new Set<keyof PomodoroSettingsSave>())

  return useMutation({
    mutationKey: pomodoroSaveKey,
    scope: settingsScope,
    mutationFn: async (save: PomodoroSettingsSave) => {
      // 설정을 불러오기 전에는 기본값으로 서버 값을 덮어쓰지 않도록 보내지 않는다.
      if (!qc.getQueryData(queryKeys.settings())) throw new Error('settings not loaded')
      const [pomodoroSession, automation] = await Promise.all([
        save.pomodoroSession ? settingsApi.updateSession(save.pomodoroSession) : undefined,
        save.automation ? settingsApi.updateAutomation(save.automation) : undefined,
      ])
      return { pomodoroSession, automation }
    },
    onSuccess: (saved, save) => {
      Object.keys(save).forEach((group) => failedGroups.current.delete(group as keyof PomodoroSettingsSave))
      qc.setQueryData<Settings>(queryKeys.settings(), (old) =>
        old && {
          ...old,
          ...(saved.pomodoroSession && { pomodoroSession: saved.pomodoroSession }),
          ...(saved.automation && { automation: saved.automation }),
        },
      )
    },
    onError: (_error, save) => {
      Object.keys(save).forEach((group) => failedGroups.current.add(group as keyof PomodoroSettingsSave))
    },
    onSettled: () => {
      if (!isLastPomodoroSave(qc)) return
      // 연속 저장이 모두 끝난 뒤 최종 결과로 한 번만 알린다.
      if (failedGroups.current.size > 0) {
        toast.error('설정을 저장하지 못했어요')
      } else {
        toast.success('저장됨', { id: 'settings-saved' })
      }
      failedGroups.current.clear()
      void qc.invalidateQueries({ queryKey: queryKeys.settings(), exact: true })
    },
  })
}

export function useUpdateMiniDaysSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationKey: miniDaysSaveKey,
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
