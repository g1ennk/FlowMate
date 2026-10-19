import { useState } from 'react'
import { BottomSheet } from '../../../ui/BottomSheet'
import type { AiReport } from '../../../api/aiReport'
import { KPT_STYLES } from '../kptParser'
import type { KptTag } from '../kptParser'
import { MarkdownText } from './MarkdownText'

type AiReportSheetProps = {
  isOpen: boolean
  onClose: () => void
  report: AiReport | null
  isCached: boolean
  isRegenerating: boolean
  // 다른 탭이나 기기에서 같은 레포트를 만드는 중이라 결과를 기다리는 상태
  isWaitingOther?: boolean
  error?: string | null
  hasExistingContent: boolean
  onStartWithAi: () => void
  onSaveAsIs: () => void
  onRegenerate: () => void
  onRetry?: () => void
  isPreview?: boolean
  isThinData?: boolean
  onLogin?: () => void
}

function SkeletonLine({ width }: { width: string }) {
  return <div className={`h-3.5 animate-pulse rounded bg-border-subtle ${width}`} />
}

function KptSkeleton() {
  return (
    <div className="space-y-3">
      {[
        { colorClass: 'text-accent', label: '✅ Keep' },
        { colorClass: 'text-state-warning', label: '⚠️ Problem' },
        { colorClass: 'text-accent-text', label: '💡 Try' },
      ].map(({ colorClass, label }) => (
        <div key={label}>
          <p className={`text-xs font-semibold ${colorClass}`}>{label}</p>
          <div className="mt-1.5 space-y-1.5">
            <SkeletonLine width="w-full" />
            <SkeletonLine width="w-3/4" />
          </div>
        </div>
      ))}
    </div>
  )
}

const SAMPLE_REPORT: AiReport = {
  id: 'sample',
  type: 'DAILY',
  periodStart: '',
  keep: '학습 카테고리 2개를 모두 완료했고, 뽀모도로 세션 간 휴식을 꾸준히 가져갔어요.',
  problem: '개발 카테고리는 3개 중 1개만 완료. 3주째 비슷한 패턴이에요.',
  try: '개발 작업을 오전 첫 세션에 배치해보세요.',
  referenceQuestion: '개발 투두가 3주째 밀리고 있는데, 시작이 어려운 이유가 있을까요?',
  promptVersion: null,
  createdAt: '',
}

export function AiReportSheet({
  isOpen,
  onClose,
  report,
  isCached,
  isRegenerating,
  isWaitingOther,
  hasExistingContent,
  onStartWithAi,
  onSaveAsIs,
  onRegenerate,
  onRetry,
  error,
  isPreview,
  isThinData,
  onLogin,
}: AiReportSheetProps) {
  const [isConfirming, setIsConfirming] = useState(false)

  const displayReport = isPreview ? SAMPLE_REPORT : report
  // 처음 생성하는 동안에는 시트를 먼저 열고 스켈레톤을 보여 준다.
  const showSkeleton = isRegenerating || (!displayReport && !error)

  // 참고해서 쓰기는 작성 중인 글 아래에 덧붙이기만 하므로 확인 없이 진행하고,
  // 이대로 저장은 기존 회고나 작성 중인 글을 대체하므로 확인을 받는다.
  const handleSaveAsIs = () => {
    if (hasExistingContent && !isConfirming) {
      setIsConfirming(true)
      return
    }
    setIsConfirming(false)
    onSaveAsIs()
  }

  const handleCancelConfirm = () => setIsConfirming(false)

  const regenerateAction = isCached && !isPreview ? (
    <button
      type="button"
      onClick={onRegenerate}
      disabled={isRegenerating}
      className="rounded-full px-3 py-1 text-xs font-medium text-text-tertiary transition-colors hover:text-text-secondary disabled:opacity-60"
    >
      {isRegenerating ? '생성 중...' : '다시 생성'}
    </button>
  ) : undefined

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={() => { setIsConfirming(false); onClose() }}
      title="AI 레포트"
      headerAction={regenerateAction}
    >
      <div className="space-y-4">
        {isPreview && (
          <p className="rounded-lg bg-accent-subtle py-1 text-center text-xs font-medium text-accent">
            샘플 레포트입니다
          </p>
        )}
        {!isPreview && isThinData && (
          <div className="rounded-lg bg-state-warning-subtle px-3 py-2 text-center">
            <p className="text-xs font-medium text-state-warning">
              데이터가 적어 정확도가 낮을 수 있어요
            </p>
            <p className="mt-0.5 text-[11px] text-text-tertiary">
              투두를 완료하면 더 정확한 분석을 받을 수 있어요
            </p>
          </div>
        )}
        {error && (
          <div className="rounded-lg bg-state-error-subtle px-3 py-2 text-center">
            <p className="text-xs font-medium text-state-error">{error}</p>
          </div>
        )}
        {showSkeleton ? (
          <div className="space-y-3">
            <p className="text-center text-xs text-text-tertiary">
              {isWaitingOther ? '이미 만드는 중이에요. 끝나면 바로 보여 드릴게요' : '보통 10~20초 걸려요'}
            </p>
            <KptSkeleton />
          </div>
        ) : displayReport && (
          <div className="space-y-3">
            {(['keep', 'problem', 'try'] as const).map((key: KptTag) => {
              const style = KPT_STYLES[key]
              return (
                <div key={key}>
                  <p className={`text-xs font-semibold ${style.colorClass}`}>
                    {style.icon} {style.label}
                  </p>
                  <div className="mt-1">
                    <MarkdownText content={displayReport[key]} />
                  </div>
                </div>
              )
            })}
            {displayReport.referenceQuestion && (
              <div>
                <p className="text-xs font-semibold text-text-tertiary">
                  ❓ Question
                </p>
                <div className="mt-1">
                  <MarkdownText content={displayReport.referenceQuestion} muted />
                </div>
              </div>
            )}
          </div>
        )}

        {!displayReport ? (
          error && !isRegenerating && onRetry && (
            <div className="pt-2">
              <button
                type="button"
                onClick={onRetry}
                className="w-full rounded-xl bg-accent py-3 text-sm font-medium text-text-inverse transition-colors hover:bg-accent-hover"
              >
                다시 시도
              </button>
            </div>
          )
        ) : isPreview ? (
          <div className="space-y-2 pt-2">
            <button
              type="button"
              onClick={() => onLogin?.()}
              className="w-full rounded-xl bg-accent py-3 text-sm font-medium text-text-inverse transition-colors hover:bg-accent-hover"
            >
              로그인하고 내 데이터로 받기
            </button>
          </div>
        ) : isConfirming ? (
          <div className="space-y-2 pt-2">
            <p className="text-center text-sm text-text-secondary">
              지금 회고를 AI 레포트로 바꿔요. 계속할까요?
            </p>
            <div className="grid grid-cols-2 gap-card-item">
              <button
                type="button"
                onClick={handleCancelConfirm}
                className="rounded-xl py-3 text-sm font-medium text-text-secondary transition-colors hover:bg-hover"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSaveAsIs}
                disabled={isRegenerating}
                className="rounded-xl bg-state-error py-3 text-sm font-medium text-text-inverse transition-colors disabled:opacity-60"
              >
                덮어쓰기
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2 pt-2">
            <button
              type="button"
              onClick={onStartWithAi}
              disabled={isRegenerating}
              className="w-full rounded-xl bg-accent py-3 text-sm font-medium text-text-inverse transition-colors hover:bg-accent-hover disabled:opacity-60"
            >
              참고해서 쓰기
            </button>
            <button
              type="button"
              onClick={handleSaveAsIs}
              disabled={isRegenerating}
              className="w-full rounded-xl border border-border-default py-3 text-sm font-medium text-text-secondary transition-colors hover:bg-hover disabled:opacity-60"
            >
              이대로 저장
            </button>
          </div>
        )}
      </div>
    </BottomSheet>
  )
}
