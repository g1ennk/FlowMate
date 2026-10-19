import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { aiReportApi } from '../../../api/aiReport'
import type { AiReport } from '../../../api/aiReport'
import type { ApiError } from '../../../api/http'
import { queryKeys } from '../../../lib/queryKeys'

// 서버 lock TTL(60초) 동안만 기다린다. 그 뒤에는 앞선 생성이 끝났거나 실패한 것이다.
export const IN_PROGRESS_POLL_INTERVAL_MS = 2_000
export const IN_PROGRESS_MAX_WAIT_MS = 60_000

export function isGenerationInProgress(err: unknown): boolean {
  return typeof err === 'object' && err !== null
    && (err as ApiError).status === 409
    && (err as ApiError).code === 'REPORT_GENERATION_IN_PROGRESS'
}

function isSameReport(a: AiReport, b: AiReport) {
  return a.keep === b.keep && a.problem === b.problem && a.try === b.try
    && a.referenceQuestion === b.referenceQuestion && a.promptVersion === b.promptVersion
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// 다른 탭이나 기기에서 같은 레포트를 만드는 중이면 끝날 때까지 GET으로 확인한다.
// 다시 생성이라면 기존 레포트와 내용이 달라질 때까지 기다린다.
async function waitForReport(
  type: string,
  periodStart: string,
  previous: AiReport | null,
  original: unknown,
): Promise<AiReport> {
  const deadline = Date.now() + IN_PROGRESS_MAX_WAIT_MS
  for (;;) {
    const report = await aiReportApi.get(type, periodStart)
    if (report && (!previous || !isSameReport(report, previous))) return report
    if (Date.now() + IN_PROGRESS_POLL_INTERVAL_MS > deadline) throw original
    await sleep(IN_PROGRESS_POLL_INTERVAL_MS)
  }
}

export function useAiReport(type: string, periodStart: string) {
  return useQuery({
    queryKey: queryKeys.aiReport(type, periodStart),
    queryFn: () => aiReportApi.get(type, periodStart),
    enabled: false,
    staleTime: Infinity,
  })
}

type GenerateVars = { type: string; periodStart: string; previous: AiReport | null }

export function useGenerateAiReport(onWaiting?: (waiting: boolean) => void) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ type, periodStart, previous }: GenerateVars) => {
      try {
        return await aiReportApi.generate(type, periodStart)
      } catch (err) {
        if (!isGenerationInProgress(err)) throw err
        onWaiting?.(true)
        try {
          return await waitForReport(type, periodStart, previous, err)
        } finally {
          onWaiting?.(false)
        }
      }
    },
    onSuccess: (data, { type, periodStart }) => {
      qc.setQueryData(queryKeys.aiReport(type, periodStart), data)
    },
  })
}

export function useAiReportFlow(type: string, periodStart: string) {
  const [isWaitingOther, setIsWaitingOther] = useState(false)
  const query = useAiReport(type, periodStart)
  const generate = useGenerateAiReport(setIsWaitingOther)

  const current = query.data ?? generate.data ?? null

  const fetchOrGenerate = async (): Promise<AiReport | null> => {
    if (current) return current
    const cached = await query.refetch()
    if (cached.error) throw cached.error
    if (cached.data) return cached.data

    return generate.mutateAsync({ type, periodStart, previous: null })
  }

  const regenerate = () => generate.mutateAsync({ type, periodStart, previous: current })

  return {
    report: current,
    isLoading: query.isFetching || generate.isPending,
    isWaitingOther,
    error: query.error ?? generate.error,
    fetchOrGenerate,
    regenerate,
    canRegenerate: !!current,
  }
}
