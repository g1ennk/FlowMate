import {
  isValidElement,
  cloneElement,
  type ButtonHTMLAttributes,
  type ReactElement,
  type ReactNode,
} from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg' | 'icon'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: Size
  asChild?: boolean
  children: ReactNode
}

const variants: Record<Variant, string> = {
  primary: 'bg-emerald-500 text-white hover:bg-emerald-600 active:bg-emerald-700',
  secondary: 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 active:bg-emerald-200',
  ghost: 'bg-transparent text-gray-500 hover:bg-gray-100 active:bg-gray-200',
  danger: 'bg-red-50 text-red-600 hover:bg-red-100 active:bg-red-200',
}

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-5 text-base',
  icon: 'h-10 w-10 p-0',
}

export function Button({
  variant = 'primary',
  size = 'md',
  asChild,
  className = '',
  children,
  ...props
}: ButtonProps) {
  const baseClass = [
    'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2',
    'disabled:pointer-events-none disabled:opacity-50',
    variants[variant],
    sizes[size],
    className,
  ].filter(Boolean).join(' ')

  if (asChild && isValidElement(children)) {
    const child = children as ReactElement<{ className?: string }>
    return cloneElement(child, {
      className: [baseClass, child.props.className].filter(Boolean).join(' '),
    })
  }

  return (
    <button className={baseClass} {...props}>
      {children}
    </button>
  )
}
