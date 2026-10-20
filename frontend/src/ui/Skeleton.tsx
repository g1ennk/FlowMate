import { Card } from './Card'

// 로딩 뼈대. 실제 화면과 같은 모양으로 두어 데이터가 와도 레이아웃이 크게 바뀌지 않게 한다(.impeccable.md §7 Skeleton).
// 뼈대 색은 border-default다(surface-sunken은 흰 카드 위에서 거의 보이지 않는다). 보조 기술에는 읽히지 않는다.

type BoneProps = {
  className?: string
}

// 반경은 control(12)이 기본이고, 점이나 원은 className으로 rounded-full을 준다(§5 반경 4종)
function Bone({ className = '' }: BoneProps) {
  const radius = /(^|\s)rounded-/.test(className) ? '' : 'rounded-control'
  return <div data-bone className={`${radius} bg-border-default motion-safe:animate-pulse ${className}`} />
}

/** 할 일 카드 안의 구간 행 4개(미분류 + 미니 데이 3개). 펼침 화살표, 구간 이름, 메타 한 줄, 추가 버튼 */
export function TodosSkeleton() {
  return (
    <div aria-hidden="true" className="space-y-list">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          data-skeleton-row
          className={`grid grid-cols-[20px_minmax(0,1fr)_auto] items-start gap-2 px-2 py-1 pb-list ${
            i === 0 ? '' : 'border-t border-border-subtle pt-card'
          }`}
        >
          <Bone className="h-4 w-4 rounded-full" />
          <div className="space-y-2">
            <Bone className="h-4 w-20" />
            <Bone className="h-3 w-28" />
          </div>
          <Bone className="h-4 w-4 rounded-full" />
        </div>
      ))}
    </div>
  )
}

/** 회고 화면: 기간 이동 줄 + 집중 기록 카드 + 할 일 카드 + 회고 카드 */
export function ReviewSkeleton() {
  return (
    <div aria-hidden="true" className="space-y-section">
      <div>
        <Bone className="h-4 w-16" />
        <Card data-skeleton-card className="mt-list">
          <div className="grid grid-cols-3 gap-card">
            {[0, 1, 2].map((i) => (
              <div key={i} className="space-y-2">
                <Bone className="h-6 w-14" />
                <Bone className="h-3 w-10" />
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div>
        <Bone className="h-4 w-20" />
        <Card data-skeleton-card className="mt-list">
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Bone className="h-4 w-4 shrink-0 rounded-full" />
                <Bone className="h-4 flex-1" />
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div data-skeleton-input>
        <Bone className="h-4 w-20" />
        <Card className="mt-list">
          <Bone className="h-32 w-full rounded-control" />
        </Card>
      </div>
    </div>
  )
}
