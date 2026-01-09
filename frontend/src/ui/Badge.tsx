import type { ReactNode } from 'react'
import { clsx } from 'clsx'

type Tone = 'default' | 'primary' | 'success' | 'warning' | 'muted'

const tones: Record<Tone, string> = {
  default: 'bg-gray-100 text-gray-600',
  primary: 'bg-emerald-50 text-emerald-600',
  success: 'bg-emerald-50 text-emerald-600',
  warning: 'bg-amber-50 text-amber-600',
  muted: 'bg-gray-50 text-gray-500',
}

type BadgeProps = {
  tone?: Tone
  children: ReactNode
  className?: string
}

export function Badge({ tone = 'default', children, className }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}
