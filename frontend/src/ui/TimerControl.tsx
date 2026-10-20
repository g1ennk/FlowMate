import type { ButtonHTMLAttributes, ReactNode } from 'react'

// 타이머 원형 버튼 56. 라벨은 원 아래 caption이고 버튼의 이름도 이 라벨이다.
// 상태마다 "지금 할 행동" 하나만 primary(timer-accent)로 두고 나머지는 neutral(timer-btn)이다.
// 버튼 자체가 원이다(배경이 곧 원). caption은 원 아래 형제로 두고 이름은 aria-label로 준다.

type TimerControlProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  label: string
  icon: ReactNode
  emphasis?: 'primary' | 'neutral'
}

const CIRCLE = {
  primary: 'bg-timer-accent text-timer-on-accent hover:not-disabled:brightness-110',
  neutral: 'bg-timer-btn text-timer-btn-text hover:not-disabled:bg-timer-btn-hover',
}

export function TimerControl({
  label,
  icon,
  emphasis = 'neutral',
  type = 'button',
  className = '',
  ...props
}: TimerControlProps) {
  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      <button
        type={type}
        aria-label={label}
        data-emphasis={emphasis}
        {...props}
        className={`peer flex h-14 w-14 items-center justify-center rounded-full transition outline-timer-focus-ring disabled:cursor-not-allowed disabled:opacity-40 [&>svg]:h-6 [&>svg]:w-6 ${CIRCLE[emphasis]}`}
      >
        {icon}
      </button>
      <span aria-hidden="true" className="whitespace-nowrap text-xs font-medium text-timer-btn-text peer-disabled:opacity-40">
        {label}
      </span>
    </div>
  )
}
