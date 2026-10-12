import { THRESHOLD } from '../lib/usePullToRefresh'
import { ArrowPathIcon } from './Icons'

const SIZE = 40

type PullToRefreshIndicatorProps = {
  pullDistance: number
  isRefreshing: boolean
}

export function PullToRefreshIndicator({ pullDistance, isRefreshing }: PullToRefreshIndicatorProps) {
  const progress = Math.min(pullDistance / THRESHOLD, 1)
  // 손가락을 따라갈 때는 즉시, 놓거나 새로고침 위치로 고정될 때만 애니메이션
  const animated = isRefreshing || pullDistance === 0

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-50 flex justify-center"
      style={{
        top: `calc(var(--safe-top) - ${SIZE}px)`,
        transform: `translateY(${pullDistance}px)`,
        opacity: progress,
        transition: animated ? 'transform 0.2s ease, opacity 0.2s ease' : 'none',
      }}
    >
      <div
        className="flex items-center justify-center rounded-full bg-surface-card text-accent shadow-md"
        style={{ width: SIZE, height: SIZE }}
      >
        <ArrowPathIcon
          className={`h-5 w-5 ${isRefreshing ? 'animate-spin' : ''}`}
          style={isRefreshing ? undefined : { transform: `rotate(${progress * 270}deg)` }}
          aria-hidden
        />
      </div>
      {isRefreshing && (
        <span role="status" className="sr-only">
          새로고침 중
        </span>
      )}
    </div>
  )
}
