import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router-dom'

// 앱의 글자 버튼은 이것 하나다. hover/active/disabled 모양도 여기서만 정한다.
// `to`를 주면 react-router Link(<a>)로 그리고 모양은 같다. 포커스 표시는 전역 :focus-visible을 쓴다.
// timer tone은 포커스 링 색을 포커스 전부터 timer-focus-ring으로 둔다(앱 테마 링이 타이머 위로 새지 않고, 전환 중에 글자색 링이 비치지 않는다)

// accent: 배경 없는 초록 글자 버튼(accent-text). 회고 제목 줄의 "AI 리포트"와 메모/회고의 "저장"에 쓴다(둘 다 사용자 결정 2026-10-20)
// info: 배경 없는 파란 글자 버튼(state-info-text). 제목 줄의 "수정"(할 일 메뉴 시트, 메모 시트, 회고)에만 쓴다(사용자 결정 2026-10-21)
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'accent' | 'danger' | 'info'
export type ButtonSize = 'md' | 'sm'

type CommonProps = {
  variant?: ButtonVariant
  size?: ButtonSize
  // timer: 늘 어두운 타이머 화면과 타이머 시트 위에서 쓴다
  tone?: 'surface' | 'timer'
  // danger를 error-strong으로 채운다. 확인 시트(ConfirmSheet) 안에서만 쓴다
  filled?: boolean
  fullWidth?: boolean
  // 알약 모양(rounded-full). 바꾸기 전 모양을 되살린 자리(회고 저장, 빈 구간 안내 카드의 추가)에만 쓴다(사용자 결정 2026-10-20)
  pill?: boolean
  icon?: ReactNode
  className?: string
  children: ReactNode
}

type ButtonAsButton = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof CommonProps> & { to?: undefined }
type ButtonAsLink = CommonProps & Omit<LinkProps, keyof CommonProps>

export type ButtonProps = ButtonAsButton | ButtonAsLink

// 모서리는 BASE와 따로 둔다(pill이 BASE 문자열을 고치지 않고 바꿔 끼운다)
const RADIUS = { control: 'rounded-control', pill: 'rounded-full' }

const BASE =
  'inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition ' +
  'disabled:cursor-not-allowed disabled:opacity-40 aria-disabled:pointer-events-none aria-disabled:opacity-40'

// sm은 보이는 높이 36이고 터치 영역만 위아래 4px씩 넓혀 44를 맞춘다(§6-2)
const SIZE: Record<ButtonSize, string> = {
  md: 'h-11 px-4',
  sm: 'relative h-9 px-3 after:absolute after:inset-x-0 after:-inset-y-1',
}

// 채운 버튼은 밝기로, 배경 없는 버튼은 옅은 면으로 hover/active를 보여 준다.
// secondary(sunken 면)는 다크에서 거의 검정이라 밝기를 낮춰도 티가 안 나서 hover 면 토큰(sunken-hover)으로 바꾼다
const FILLED_FEEDBACK = 'hover:not-disabled:brightness-95 active:not-disabled:brightness-90'
const SUNKEN_FEEDBACK = 'hover:not-disabled:bg-sunken-hover active:not-disabled:bg-sunken-hover'

const SURFACE: Record<ButtonVariant, string> = {
  primary: `bg-accent-fill text-on-accent ${FILLED_FEEDBACK}`,
  secondary: `bg-surface-sunken text-text-primary ${SUNKEN_FEEDBACK}`,
  ghost: 'text-text-secondary hover:not-disabled:bg-hover-strong hover:not-disabled:text-text-primary active:not-disabled:bg-hover-strong',
  accent: 'text-accent-text hover:not-disabled:bg-accent-subtle active:not-disabled:bg-accent-subtle',
  danger: 'text-state-error-text hover:not-disabled:bg-state-error-subtle active:not-disabled:bg-state-error-subtle',
  info: 'text-state-info-text hover:not-disabled:bg-hover-strong active:not-disabled:bg-hover-strong',
}

const DANGER_FILLED = `bg-state-error-strong text-on-error ${FILLED_FEEDBACK}`

const TIMER: Record<ButtonVariant, string> = {
  primary: 'bg-timer-accent text-timer-on-accent hover:not-disabled:brightness-110 active:not-disabled:brightness-95 outline-timer-focus-ring',
  secondary: 'bg-timer-btn text-timer-btn-text hover:not-disabled:bg-timer-btn-hover outline-timer-focus-ring',
  ghost: 'text-timer-modal-secondary hover:not-disabled:bg-timer-btn hover:not-disabled:text-timer-btn-text outline-timer-focus-ring',
  accent: 'text-timer-accent hover:not-disabled:bg-timer-btn outline-timer-focus-ring',
  info: 'text-timer-btn-text hover:not-disabled:bg-timer-btn outline-timer-focus-ring',
  // 타이머 면은 늘 어두워서 테마를 따르는 error-text로는 대비가 모자라다. 그래서 채운다
  danger: `bg-state-error-strong text-on-error ${FILLED_FEEDBACK} outline-timer-focus-ring`,
}

function buttonClassName({
  variant = 'primary',
  size = 'md',
  tone = 'surface',
  filled = false,
  fullWidth = false,
  pill = false,
  className = '',
}: Pick<CommonProps, 'variant' | 'size' | 'tone' | 'filled' | 'fullWidth' | 'pill' | 'className'>) {
  // 타이머 위의 danger는 원래 채운 모양이라 filled와 상관없이 TIMER를 쓴다(포커스 링도 타이머 토큰)
  const color = tone === 'timer' ? TIMER[variant] : variant === 'danger' && filled ? DANGER_FILLED : SURFACE[variant]
  return [BASE, pill ? RADIUS.pill : RADIUS.control, SIZE[size], color, fullWidth ? 'w-full' : '', className].filter(Boolean).join(' ')
}

export function Button(props: ButtonProps) {
  const { variant, size, tone, filled, fullWidth, pill, icon, className, children, ...rest } = props
  const classes = buttonClassName({ variant, size, tone, filled, fullWidth, pill, className })
  const content = (
    <>
      {icon}
      {children}
    </>
  )

  if (rest.to !== undefined) {
    return (
      <Link {...(rest as Omit<LinkProps, keyof CommonProps>)} className={classes}>
        {content}
      </Link>
    )
  }

  const { type = 'button', ...buttonRest } = rest as Omit<ButtonAsButton, keyof CommonProps>
  return (
    <button type={type} {...buttonRest} className={classes}>
      {content}
    </button>
  )
}
