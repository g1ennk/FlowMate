import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { settingsApi } from '../../api/settings'
import { type PomodoroSettings } from '../../api/types'
import { queryKeys } from '../../lib/queryKeys'

export function usePomodoroSettings() {
  return useQuery({
    queryKey: queryKeys.settings(),
    queryFn: () => settingsApi.get(),
  })
}

export function useUpdatePomodoroSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: PomodoroSettings) => settingsApi.update(payload),
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.settings(), data)
    },
  })
}
