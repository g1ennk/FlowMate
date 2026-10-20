import { BottomSheet } from '../../../ui/BottomSheet'
import { Button } from '../../../ui/Button'
import { InlineStatus } from '../../../ui/InlineStatus'
import { SectionHeader } from '../../../ui/SectionHeader'
import type { AiReport } from '../../../api/aiReport'
import type { PeriodType } from '../reviewTypes'
import { MarkdownText } from './MarkdownText'

// AI 리포트는 그 기간의 요약이다(.impeccable.md §8). 회고와 따로 만들고 따로 보여 준다.
// 그래서 이 시트는 읽기 전용이고, AI 글을 회고 입력창에 넣는 버튼이 없다.
// 필드 이름(keep/problem/try)은 API 그대로이고 뜻은 "한 일 / 눈에 띈 점 / 해 볼 만한 것"이다.

type AiReportSheetProps = {
  isOpen: boolean
  onClose: () => void
  periodType: PeriodType
  report: AiReport | null
  isCached: boolean
  isRegenerating: boolean
  error?: string | null
  onRegenerate: () => void
  onRetry?: () => void
  // 시트를 닫고 회고 입력창으로 간다(실패했을 때 쓰는 다른 길)
  onWriteYourself: () => void
  isPreview?: boolean
  isThinData?: boolean
  onLogin?: () => void
}

const TRY_HEADINGS: Record<PeriodType, string> = {
  daily: '내일 해 볼 만한 것',
  weekly: '다음 주에 해 볼 만한 것',
  monthly: '다음 달에 해 볼 만한 것',
}

function getSections(periodType: PeriodType) {
  return [
    { key: 'keep', heading: '한 일' },
    { key: 'problem', heading: '눈에 띈 점' },
    { key: 'try', heading: TRY_HEADINGS[periodType] },
  ] as const
}

function SectionHeading({ children }: { children: string }) {
  return <SectionHeader title={children} size="sm" as="h3" />
}

function SkeletonLine({ width }: { width: string }) {
  return <div className={`h-4 rounded-control bg-border-default motion-safe:animate-pulse ${width}`} />
}

// 게스트 예시. 실제 리포트가 쓰는 단위(미니데이 구간, 집중 횟수, 완료 수)로만 쓴다
const SAMPLE_REPORT: AiReport = {
  id: 'sample',
  type: 'DAILY',
  periodStart: '',
  keep: '오전 구간에 할 일 3개를 끝냈어요. 집중 4회, 1시간 40분이 기록됐어요.',
  problem: '오후 구간에는 집중 기록이 없어요.',
  try: '오후 구간 할 일 2개가 아직 남아 있어요.',
  referenceQuestion: '오후에 시작이 늦어진 이유가 있었을까요?',
  promptVersion: null,
  createdAt: '',
}

export function AiReportSheet({
  isOpen,
  onClose,
  periodType,
  report,
  isCached,
  isRegenerating,
  onRegenerate,
  onRetry,
  onWriteYourself,
  error,
  isPreview,
  isThinData,
  onLogin,
}: AiReportSheetProps) {
  const displayReport = isPreview ? SAMPLE_REPORT : report
  // 처음 생성하는 동안에는 시트를 먼저 열고 뼈대를 보여 준다.
  const showSkeleton = isRegenerating || (!displayReport && !error)
  const sections = getSections(periodType)

  const regenerateAction = isCached && !isPreview ? (
    <Button variant="ghost" size="sm" onClick={onRegenerate} disabled={isRegenerating}>
      {isRegenerating ? '생성 중...' : '다시 생성'}
    </Button>
  ) : undefined

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title={isPreview ? 'AI 리포트 예시' : 'AI 리포트'}
      headerAction={regenerateAction}
    >
      <div className="space-y-card">
        {!isPreview && isThinData && (
          <p className="break-keep text-xs text-text-secondary">기록이 적어서 요약이 짧을 수 있어요</p>
        )}
        {error && <InlineStatus message={error} />}
        {showSkeleton ? (
          <div className="space-y-card">
            <p className="text-xs text-text-secondary">보통 10~20초 걸려요</p>
            {sections.map(({ key, heading }) => (
              <div key={key} className="space-y-list">
                <SectionHeading>{heading}</SectionHeading>
                <SkeletonLine width="w-full" />
                <SkeletonLine width="w-3/4" />
              </div>
            ))}
          </div>
        ) : displayReport && (
          <div className="space-y-card">
            {sections.map(({ key, heading }) => (
              <section key={key} className="space-y-tight">
                <SectionHeading>{heading}</SectionHeading>
                <MarkdownText content={displayReport[key]} />
              </section>
            ))}
            {displayReport.referenceQuestion && (
              <p className="break-keep border-t border-border-subtle pt-card-item text-sm text-text-secondary">
                {displayReport.referenceQuestion}
              </p>
            )}
          </div>
        )}

        {!displayReport ? (
          error && !isRegenerating && (
            <div className={`grid gap-list ${onRetry ? 'grid-cols-2' : 'grid-cols-1'}`}>
              <Button variant="secondary" onClick={onWriteYourself}>직접 쓰기</Button>
              {onRetry && <Button onClick={onRetry}>다시 시도</Button>}
            </div>
          )
        ) : isPreview && (
          <Button fullWidth onClick={() => onLogin?.()}>로그인하고 내 데이터로 받기</Button>
        )}
      </div>
    </BottomSheet>
  )
}
