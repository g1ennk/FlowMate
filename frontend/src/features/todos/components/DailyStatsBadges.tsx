type DailyStatsBadgesProps = {
  sessionCount: number
  sessionMinutes: number
}

/**
 * 일별 통계 뱃지 (총 시간/뽀모도로 세션)
 */
export function DailyStatsBadges({ sessionCount, sessionMinutes }: DailyStatsBadgesProps) {
  if (sessionCount === 0 && sessionMinutes === 0) {
    return null
  }

  return (
    <div className="flex items-center gap-1.5">
      {/* 총 집중 시간 */}
      {sessionMinutes > 0 && (
        <span className="inline-flex h-5 items-center gap-1 rounded-md bg-blue-50 px-1.5 text-[11px] font-medium text-blue-600">
          <span className="h-2.5 w-2.5 rounded-sm bg-blue-500" />
          {sessionMinutes}분
        </span>
      )}
      {/* 뽀모도로 세션 */}
      {sessionCount > 0 && (
        <span className="inline-flex h-5 items-center gap-1 rounded-md bg-red-50 px-1.5 text-[11px] font-medium text-red-600">
          <span className="h-2.5 w-2.5 rounded-sm bg-red-500" />
          {sessionCount}회
        </span>
      )}
    </div>
  )
}
