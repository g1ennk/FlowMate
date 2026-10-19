import { useCallback, useRef, useState } from 'react'
import { useAuthStore } from '../../../store/authStore'
import { useAiReportFlow } from './useAiReport'
import type { PeriodType } from '../reviewTypes'

function toAiErrorMessage(err: unknown): string {
  const status = typeof err === 'object' && err !== null && 'status' in err
    ? (err as { status: number }).status : undefined
  if (status === 429 || status === 503 || status === 504) return '잠시 후 다시 시도해 주세요'
  if (status === 400) return '이 기간에 완료한 할 일이 없어서 분석할 수 없어요'
  return 'AI 레포트를 만들지 못했어요'
}

export function useAiReportSheet(
  periodType: PeriodType,
  periodStart: string,
  completedTodoCount: number,
  totalSessionCount: number,
) {
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const isSheetOpenRef = useRef(false)
  const sheetClosedAtRef = useRef(0)
  const [isPreview, setIsPreview] = useState(false)
  const isMember = useAuthStore((s) => s.state?.type === 'member')
  const isThinData = completedTodoCount === 0 && totalSessionCount === 0

  const {
    report: aiReport,
    isLoading: isAiLoading,
    fetchOrGenerate,
    regenerate,
    canRegenerate,
  } = useAiReportFlow(periodType, periodStart)

  // 처음 생성, 다시 시도, 다시 생성의 실패를 시트 안에 보여 준다. 시트를 새로 열면 지운다.
  const [aiError, setAiError] = useState<string | null>(null)

  const openSheet = useCallback((preview = false) => {
    setIsPreview(preview)
    setAiError(null)
    setIsSheetOpen(true)
    isSheetOpenRef.current = true
  }, [])

  const closeSheet = useCallback(() => {
    setIsSheetOpen(false)
    isSheetOpenRef.current = false
    setIsPreview(false)
    sheetClosedAtRef.current = Date.now()
  }, [])

  const loadReport = useCallback(async () => {
    setAiError(null)
    try {
      await fetchOrGenerate()
    } catch (err: unknown) {
      setAiError(toAiErrorMessage(err))
    }
  }, [fetchOrGenerate])

  // 생성은 길게는 수십 초 걸리므로 시트를 먼저 열고 시트 안에서 진행 상태를 보여 준다.
  const requestAiReport = useCallback(async () => {
    if (!isMember) {
      openSheet(true)
      return
    }
    openSheet()
    await loadReport()
  }, [isMember, openSheet, loadReport])

  const handleRegenerate = useCallback(async () => {
    setAiError(null)
    try {
      await regenerate()
    } catch (err: unknown) {
      setAiError(toAiErrorMessage(err))
    }
  }, [regenerate])

  return {
    aiReport,
    isAiLoading,
    canRegenerate,
    aiError,
    isSheetOpen,
    isPreview,
    isThinData,
    isMember,
    isSheetOpenRef,
    sheetClosedAtRef,
    closeSheet,
    requestAiReport,
    retryAiReport: loadReport,
    handleRegenerate,
  }
}
