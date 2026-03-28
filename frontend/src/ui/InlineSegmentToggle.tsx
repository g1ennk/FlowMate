type InlineSegmentToggleProps = {
  options: Array<{ label: string; value: string }>
  value: string
  onChange: (value: string) => void
  className?: string
}

export function InlineSegmentToggle({
  options,
  value,
  onChange,
  className = '',
}: InlineSegmentToggleProps) {
  return (
    <div className={`inline-flex rounded-full bg-white/10 p-0.5 ${className}`}>
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
              active
                ? 'bg-white text-gray-900'
                : 'text-white/70 hover:text-white'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
