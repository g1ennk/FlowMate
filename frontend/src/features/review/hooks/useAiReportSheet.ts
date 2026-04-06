import { useCallback, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { useAuthStore } from '../../../store/authStore'
import { useAiReportFlow } from './useAiReport'
import type { PeriodType } from '../reviewTypes'

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

  const openSheet = useCallback((preview = false) => {
    setIsPreview(preview)
    setIsSheetOpen(true)
    isSheetOpenRef.current = true
  }, [])

  const closeSheet = useCallback(() => {
    setIsSheetOpen(false)
    isSheetOpenRef.current = false
    setIsPreview(false)
    sheetClosedAtRef.current = Date.now()
  }, [])

  const requestAiReport = useCallback(async () => {
    if (!isMember) {
      openSheet(true)
      return
    }
    if (isThinData) {
      toast('완료한 할 일이 있으면 더 정확한 분석을 받을 수 있어요', {
        id: 'ai-report-thin-data',
      })
    }
    try {
      await fetchOrGenerate()
      openSheet()
    } catch (err: unknown) {
      const status = typeof err === 'object' && err !== null && 'status' in err
        ? (err as { status: number }).status : undefined
      if (status === 429) {
        toast.error('잠시 후 다시 시도해주세요')
      } else if (status === 400) {
        toast('이 기간에 완료한 할 일이 없어서 분석할 수 없어요', { id: 'ai-report-no-data' })
      } else {
        toast.error('AI 서비스에 문제가 생겼어요')
      }
    }
  }, [isMember, isThinData, fetchOrGenerate, openSheet])

  const [regenerateError, setRegenerateError] = useState<string | null>(null)

  const handleRegenerate = useCallback(async () => {
    setRegenerateError(null)
    try {
      await regenerate()
    } catch (err: unknown) {
      const status = typeof err === 'object' && err !== null && 'status' in err
        ? (err as { status: number }).status : undefined
      if (status === 429) {
        setRegenerateError('잠시 후 다시 시도해주세요')
      } else if (status === 400) {
        setRegenerateError('이 기간에 완료한 할 일이 없어서 분석할 수 없어요')
      } else {
        setRegenerateError('다시 생성에 실패했어요')
      }
    }
  }, [regenerate])

  return {
    aiReport,
    isAiLoading,
    canRegenerate,
    regenerateError,
    isSheetOpen,
    isPreview,
    isThinData,
    isMember,
    isSheetOpenRef,
    sheetClosedAtRef,
    closeSheet,
    requestAiReport,
    handleRegenerate,
  }
}
