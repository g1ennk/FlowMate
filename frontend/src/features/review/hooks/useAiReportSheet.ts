import { useCallback, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { useAuthStore } from '../../../store/authStore'
import { useAiReportFlow } from './useAiReport'
import { toastMessages } from '../../../lib/messages'
import type { PeriodType } from '../reviewTypes'

type AiError = { message: string; retryable: boolean }

function toAiError(err: unknown): AiError {
  const status = typeof err === 'object' && err !== null && 'status' in err
    ? (err as { status: number }).status : undefined
  if (status === 429 || status === 503 || status === 504) {
    return { message: toastMessages.aiReportBusy, retryable: true }
  }
  // 할 일이 없어서 실패한 것은 다시 시도해도 같으므로 다시 시도를 내주지 않는다.
  if (status === 400) {
    return { message: toastMessages.aiReportNoData, retryable: false }
  }
  return { message: toastMessages.aiReportFailed, retryable: true }
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
  const [aiError, setAiError] = useState<AiError | null>(null)

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

  // 기다리다 시트를 닫았으면 시트 안 오류를 볼 수 없으므로 토스트로 한 번 알린다.
  const reportError = useCallback((err: unknown) => {
    const error = toAiError(err)
    setAiError(error)
    if (!isSheetOpenRef.current) {
      toast.error(error.message, { id: 'ai-report-failed' })
    }
  }, [])

  const loadReport = useCallback(async () => {
    setAiError(null)
    try {
      await fetchOrGenerate()
    } catch (err: unknown) {
      reportError(err)
    }
  }, [fetchOrGenerate, reportError])

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
      reportError(err)
    }
  }, [regenerate, reportError])

  return {
    aiReport,
    isAiLoading,
    canRegenerate,
    aiError: aiError?.message ?? null,
    isSheetOpen,
    isPreview,
    isThinData,
    isMember,
    isSheetOpenRef,
    sheetClosedAtRef,
    closeSheet,
    requestAiReport,
    retryAiReport: aiError && !aiError.retryable ? undefined : loadReport,
    handleRegenerate,
  }
}
