import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { aiReportApi } from '../../../api/aiReport'
import type { AiReport } from '../../../api/aiReport'
import { queryKeys } from '../../../lib/queryKeys'

export function useAiReport(type: string, periodStart: string) {
  return useQuery({
    queryKey: queryKeys.aiReport(type, periodStart),
    queryFn: () => aiReportApi.get(type, periodStart),
    enabled: false,
    staleTime: Infinity,
  })
}

export function useGenerateAiReport() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: ({ type, periodStart }: { type: string; periodStart: string }) =>
      aiReportApi.generate(type, periodStart),
    onSuccess: (data, { type, periodStart }) => {
      qc.setQueryData(queryKeys.aiReport(type, periodStart), data)
    },
  })
}

export function useAiReportFlow(type: string, periodStart: string) {
  const query = useAiReport(type, periodStart)
  const generate = useGenerateAiReport()

  const fetchOrGenerate = async (): Promise<AiReport | null> => {
    const existing = query.data ?? generate.data
    if (existing) return existing
    const cached = await query.refetch()
    if (cached.error) throw cached.error
    if (cached.data) return cached.data

    return generate.mutateAsync({ type, periodStart })
  }

  const regenerate = () => generate.mutateAsync({ type, periodStart })

  return {
    report: query.data ?? generate.data ?? null,
    isLoading: query.isFetching || generate.isPending,
    error: query.error ?? generate.error,
    fetchOrGenerate,
    regenerate,
    canRegenerate: !!(query.data ?? generate.data),
  }
}
