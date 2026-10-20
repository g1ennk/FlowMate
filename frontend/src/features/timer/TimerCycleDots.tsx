// 집중 횟수 점(.impeccable.md §2-2): 완료 ●, 진행 중 막대, 남음 ○.
// 뽀모도로와 일반 타이머, 집중과 휴식이 모두 이 한 가지 모양을 쓴다. 휴식 중에는 휴식 색(timer-break-text)으로 칠한다.

// progress: 0~100. null이면 목표가 없는 진행(카운트업)이라 막대 모양만 보여 준다
export type CycleDot = 'done' | 'todo' | { progress: number | null }

type TimerCycleDotsProps = {
  dots: CycleDot[]
  tone: 'focus' | 'break'
  // 점이 무엇을 세는지 화면 읽기 프로그램에 알려 준다
  label: string
}

const FILL = {
  focus: 'bg-timer-accent',
  break: 'bg-timer-break-text',
}

export function TimerCycleDots({ dots, tone, label }: TimerCycleDotsProps) {
  return (
    <div role="img" aria-label={label} className="flex h-3 items-center justify-center gap-2">
      {dots.map((dot, i) => {
        if (dot === 'done') return <span key={i} data-dot="done" className={`h-2.5 w-2.5 rounded-full ${FILL[tone]}`} />
        // 남은 점은 채우지 않은 ○다. 테두리는 보조 글자 색이라 어두운 면 위에서도 모양이 보인다
        if (dot === 'todo') return <span key={i} data-dot="todo" className="h-2.5 w-2.5 rounded-full border border-timer-modal-secondary" />
        return (
          <span key={i} className="relative h-3 w-10 overflow-hidden rounded-full bg-timer-btn">
            {dot.progress !== null && (
              <span
                data-testid="cycle-progress"
                className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-300 ${FILL[tone]}`}
                style={{ width: `${Math.min(100, Math.max(0, dot.progress))}%` }}
              />
            )}
          </span>
        )
      })}
    </div>
  )
}
