type InlineSegmentToggleProps = {
  options: Array<{ label: string; value: string }>
  value: string
  onChange: (value: string) => void
  className?: string
  // overlay: 어두운 타이머 화면 위, surface: 일반 카드 위
  tone?: 'overlay' | 'surface'
  ariaLabel?: string
}

const TONE_CLASSES = {
  overlay: {
    track: 'bg-white/10',
    active: 'bg-surface-card text-text-primary',
    inactive: 'text-white/70 hover:text-white',
  },
  surface: {
    track: 'bg-surface-sunken',
    active: 'bg-surface-card text-text-primary shadow-sm',
    inactive: 'text-text-secondary hover:text-text-primary',
  },
}

export function InlineSegmentToggle({
  options,
  value,
  onChange,
  className = '',
  tone = 'overlay',
  ariaLabel,
}: InlineSegmentToggleProps) {
  const toneClasses = TONE_CLASSES[tone]
  return (
    <div
      role={ariaLabel ? 'group' : undefined}
      aria-label={ariaLabel}
      className={`inline-flex rounded-full p-0.5 ${toneClasses.track} ${className}`}
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
              active ? toneClasses.active : toneClasses.inactive
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
