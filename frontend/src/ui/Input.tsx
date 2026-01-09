import { forwardRef, type InputHTMLAttributes } from 'react'
import { clsx } from 'clsx'

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, ...props }, ref) => {
    return (
      <div className="w-full">
        <input
          ref={ref}
          className={clsx(
            'w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-gray-900 outline-none transition-colors',
            'placeholder:text-gray-400',
            'focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500',
            error ? 'border-red-300' : 'border-gray-200',
            className,
          )}
          {...props}
        />
        {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
      </div>
    )
  },
)

Input.displayName = 'Input'
