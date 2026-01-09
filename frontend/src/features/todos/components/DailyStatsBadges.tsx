type DailyStatsBadgesProps = {
  remaining: number
  done: number
  sessionCount: number
  sessionMinutes: number
}

/**
 * 일별 통계 뱃지 (미완료/완료/세션)
 */
export function DailyStatsBadges({ remaining, done, sessionCount, sessionMinutes }: DailyStatsBadgesProps) {
  if (remaining === 0 && done === 0 && sessionCount === 0 && sessionMinutes === 0) {
    return null
  }

  return (
    <div className="flex items-center gap-1.5">
      {/* 미완료 */}
      {remaining > 0 && (
        <span className="inline-flex h-5 items-center gap-1 rounded-md bg-amber-50 px-1.5 text-[11px] font-medium text-amber-600">
          <span className="flex h-2.5 w-2.5 items-center justify-center rounded-sm border border-amber-400" />
          {remaining}
        </span>
      )}
      {/* 완료 */}
      {done > 0 && (
        <span className="inline-flex h-5 items-center gap-1 rounded-md bg-emerald-50 px-1.5 text-[11px] font-medium text-emerald-600">
          <span className="flex h-2.5 w-2.5 items-center justify-center rounded-sm bg-emerald-500 text-white text-[8px]">
            ✓
          </span>
          {done}
        </span>
      )}
      {/* 세션 */}
      {(sessionCount > 0 || sessionMinutes > 0) && (
        <span className="inline-flex h-5 items-center gap-1 rounded-md bg-blue-50 px-1.5 text-[11px] font-medium text-blue-600">
          <span className="h-2.5 w-2.5 rounded-sm bg-blue-400" />
          {sessionCount}회, {sessionMinutes}분
        </span>
      )}
    </div>
  )
}
