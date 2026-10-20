import { useRef, type KeyboardEvent } from 'react'

// 여러 값 중 하나를 고르는 세그먼트(달력 월/주, 회고 기간, 설정 테마, 타이머 표시 기준).
// 의미는 radiogroup/radio다: 고른 칸만 Tab으로 들어오고, 방향키로 옮기면 바로 고른다.
// ariaLabel은 그룹 이름이고, 칸 글자만으로 뜻이 모자라면 option.ariaLabel을 준다("월" → "월 보기").

export type SegmentOption<T extends string> = {
  label: string
  value: T
  ariaLabel?: string
}

type SegmentToggleProps<T extends string> = {
  options: ReadonlyArray<SegmentOption<T>>
  value: T
  onChange: (value: T) => void
  ariaLabel: string
  // surface: 일반 화면과 카드 위.
  // timer: 늘 어두운 타이머 풀스크린 위. 테마(라이트/다크)와 무관하게 timer-* 토큰만 쓴다
  tone?: 'surface' | 'timer'
  // 칸을 같은 너비로 나눠 줄을 꽉 채운다(회고 기간)
  fullWidth?: boolean
  // none: 트랙 면을 칠하지 않는다. 이미 흰 카드 안에 있을 때 회색 상자를 겹치지 않으려고 쓴다(회고 기간, 사용자 결정 2026-10-20).
  // 트랙 면이 없으니 고른 칸이 스스로 보여야 한다. outline이면 3:1 테두리, accent면 연두 면으로 보인다(회고 기간은 accent)
  track?: 'filled' | 'none'
  // accent: 고른 칸을 연두 면(accent-muted)과 초록 글자로 칠한다. 테두리는 두지 않는다(회고 기간, 사용자 결정 2026-10-20)
  selectedStyle?: 'outline' | 'accent'
  // chip: 예전 타이머 화면의 작은 칩(둥근 알약 트랙, 고른 칸은 밝게 채움, 11px). 타이머의 "현재 세션/전체 누적"에만 쓴다(사용자 결정 2026-10-20).
  // tone과 상관없이 timer-* 토큰을 쓰므로 tone="timer"와 함께만 쓴다
  shape?: 'default' | 'chip'
  className?: string
}

// selectedStyle="outline"(기본): surface는 계획 달력 월/주처럼 고른 칸을 카드 면으로 채우고 그림자와 굵은 글자로 구분한다(테두리를 두르면 포커스 표시처럼 보여서 뺐다, 사용자 결정 2026-10-21).
// timer는 고른 칸에 3:1 넘는 경계선(안쪽 ring 1px, timer-modal-secondary)을 두른다. 기본 모양은 accent로 채우지 않는다(§3-1).
// selectedStyle="accent"는 사용자 결정(회고 기간)으로 둔 예외라 연두 면(accent-muted)을 쓰고 링은 두지 않는다.
// border가 아니라 ring이라 칸 크기와 터치 영역(after)이 그대로다
// accent-text #047857은 accent-muted #d1fae5 위에서 대비 약 5:1이다
const ACCENT_ACTIVE = 'bg-accent-muted font-semibold text-accent-text'
// 트랙 면이 없으면(흰 카드 위) 채운 칸이 보이지 않으니 3:1 넘는 경계선(안쪽 ring 1px, text-tertiary)을 두른다
const NO_TRACK_RING = 'ring-1 ring-inset ring-text-tertiary'

// 고른 칸은 #ececec 면에 #1e1e1e 글자(대비 약 14:1), 고르지 않은 칸은 #b8b8b8 글자다. 보이는 높이는 약 26이고
// 터치 영역만 위아래 10px씩 넓혀 44에 가깝게 맞춘다
const CHIP = {
  track: 'inline-flex shrink-0 items-stretch rounded-full bg-timer-btn p-0.5',
  button: 'relative rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors outline-timer-focus-ring after:absolute after:inset-x-0 after:-inset-y-2.5',
  active: 'bg-timer-focus-text text-timer-focus-bg',
  inactive: 'text-timer-modal-secondary hover:text-timer-btn-text',
}

const TONE = {
  surface: {
    track: 'bg-surface-sunken',
    // 계획 달력 월/주와 같은 모양: 고른 칸을 카드 면으로 채우고 옅은 그림자를 준다(테두리 없음, 사용자 결정 2026-10-21)
    active: 'bg-surface-card font-semibold text-text-primary shadow-sm',
    inactive: 'font-medium text-text-secondary hover:text-text-primary',
  },
  timer: {
    track: 'bg-timer-btn',
    active: 'bg-timer-btn-hover font-semibold text-timer-focus-text ring-1 ring-inset ring-timer-modal-secondary',
    inactive: 'font-medium text-timer-modal-secondary hover:text-timer-btn-text',
  },
}

export function SegmentToggle<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  tone = 'surface',
  fullWidth = false,
  track = 'filled',
  selectedStyle = 'outline',
  shape = 'default',
  className = '',
}: SegmentToggleProps<T>) {
  const buttonsRef = useRef<Array<HTMLButtonElement | null>>([])
  const toneClasses = TONE[tone]
  const selectedIndex = options.findIndex((option) => option.value === value)
  // 고른 값이 목록에 없으면 첫 칸으로 Tab이 들어오게 한다
  const focusableIndex = selectedIndex === -1 ? 0 : selectedIndex

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (step === 0) return
    e.preventDefault()
    const nextIndex = (index + step + options.length) % options.length
    buttonsRef.current[nextIndex]?.focus()
    onChange(options[nextIndex].value)
  }

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={shape === 'chip'
        ? `${CHIP.track} ${className}`
        : `${fullWidth ? 'flex w-full' : 'inline-flex'} h-9 shrink-0 items-stretch rounded-control p-1 ${track === 'filled' ? toneClasses.track : ''} ${className}`}
    >
      {options.map((option, index) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            ref={(node) => {
              buttonsRef.current[index] = node
            }}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={option.ariaLabel}
            tabIndex={index === focusableIndex ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            // 칸의 보이는 높이는 28이고 터치 영역만 위아래 8px씩 넓혀 44를 맞춘다. 가로는 칸 자체를 44 이상으로 둔다
            className={shape === 'chip'
              ? `${CHIP.button} ${active ? CHIP.active : CHIP.inactive}`
              : `relative min-w-11 whitespace-nowrap rounded-control px-3 text-sm transition-colors after:absolute after:inset-x-0 after:-inset-y-2 ${fullWidth ? 'flex-1' : ''} ${
                tone === 'timer' ? 'outline-timer-focus-ring' : ''
              } ${active ? (selectedStyle === 'accent' ? ACCENT_ACTIVE : `${toneClasses.active} ${track === 'none' && tone === 'surface' ? NO_TRACK_RING : ''}`) : toneClasses.inactive}`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
