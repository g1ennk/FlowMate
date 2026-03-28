type SkeletonProps = {
  className?: string
}

function Bone({ className = '' }: SkeletonProps) {
  return (
    <div className={`animate-pulse rounded-lg bg-surface-sunken ${className}`} />
  )
}

export function TodosSkeleton() {
  return (
    <div className="space-y-4 py-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-2">
          <div className="flex items-center gap-2">
            <Bone className="h-4 w-20" />
            <Bone className="h-3 w-12" />
          </div>
          {[0, 1].map((j) => (
            <div key={j} className="flex items-center gap-3 px-2 py-1.5">
              <Bone className="h-5 w-5 shrink-0 rounded-full" />
              <Bone className="h-4 flex-1" />
              <Bone className="h-4 w-4 shrink-0 rounded-full" />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

export function ReviewSkeleton() {
  return (
    <div className="space-y-section">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-card rounded-2xl bg-surface-card p-card shadow-sm">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col items-center gap-2">
            <Bone className="h-6 w-16" />
            <Bone className="h-3 w-10" />
          </div>
        ))}
      </div>
      {/* Task list */}
      <div className="rounded-2xl bg-surface-card p-card shadow-sm">
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Bone className="h-4 w-4 shrink-0 rounded-full" />
              <Bone className="h-4 flex-1" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
