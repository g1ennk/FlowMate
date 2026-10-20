import type { ButtonHTMLAttributes, ReactNode } from 'react'

// 아이콘만 있는 버튼. 보이는 크기 32(아이콘 20), 터치 영역은 의사 요소로 48까지 넓힌다.
// label은 aria-label이 된다(필수). 아이콘은 children으로 넣는다: <IconButton label="닫기"><CloseIcon /></IconButton>
// 넓힌 영역이 사방 8px이라 옆에 다른 터치 대상이 있으면 간격을 8 이상(gap-list) 둔다. 더 좁으면 이웃 버튼의 보이는 면을 덮는다.

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'children'> & {
  label: string
  children: ReactNode
  // timer: 늘 어두운 타이머 화면과 타이머 시트 위에서 쓴다
  tone?: 'surface' | 'timer'
}

const TONE = {
  surface: 'text-text-secondary hover:not-disabled:bg-hover-strong hover:not-disabled:text-text-primary',
  timer: 'text-timer-btn-text hover:not-disabled:bg-timer-btn outline-timer-focus-ring',
}

export function IconButton({
  label,
  children,
  tone = 'surface',
  type = 'button',
  className = '',
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      {...props}
      className={`relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-control transition-colors after:absolute after:-inset-2 disabled:cursor-not-allowed disabled:opacity-40 [&>svg]:h-5 [&>svg]:w-5 ${TONE[tone]} ${className}`}
    >
      {children}
    </button>
  )
}
