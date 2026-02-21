import type { PropsWithChildren, ReactNode } from 'react'
import { clsx } from 'clsx'

type CardProps = PropsWithChildren<{
  title?: string
  description?: string
  actions?: ReactNode
  className?: string
  noPadding?: boolean
}>

export function Card({
  title,
  description,
  actions,
  className,
  noPadding,
  children,
}: CardProps) {
  return (
    <section
      className={clsx(
        'rounded-2xl bg-white shadow-sm',
        !noPadding && 'p-4',
        className,
      )}
    >
      {(title || actions) && (
        <header
          className={clsx(
            'flex items-start justify-between gap-3',
            !noPadding && children && 'mb-3',
          )}
        >
          <div className="min-w-0 flex-1">
            {title && (
              <h2 className="truncate text-base font-semibold text-gray-900">
                {title}
              </h2>
            )}
            {description && (
              <p className="mt-0.5 truncate text-sm text-gray-500">
                {description}
              </p>
            )}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  )
}
