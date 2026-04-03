import { api } from './http'
import { z } from 'zod'

const ReportSchema = z.object({
  id: z.string(),
  type: z.string(),
  periodStart: z.string(),
  keep: z.string(),
  problem: z.string(),
  try: z.string(),
  referenceQuestion: z.string().nullable().default(null),
  promptVersion: z.string().nullable(),
  createdAt: z.string(),
})

export type AiReport = z.infer<typeof ReportSchema>

export const aiReportApi = {
  // 204 No Content → http.ts가 undefined 반환 → null로 변환
  get: async (type: string, periodStart: string): Promise<AiReport | null> =>
    await api.get<AiReport>(
      `/ai?type=${type.toUpperCase()}&periodStart=${periodStart}`,
      ReportSchema,
    ) ?? null,

  generate: (type: string, periodStart: string): Promise<AiReport> =>
    api.post<AiReport>(
      '/ai/generate',
      { type: type.toUpperCase(), periodStart },
      ReportSchema,
    ) as Promise<AiReport>,
}
