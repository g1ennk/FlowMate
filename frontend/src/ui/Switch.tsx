type SwitchProps = {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  label?: string
  description?: string
}

export function Switch({ checked, onChange, disabled, label, description }: SwitchProps) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3">
      {(label || description) && (
        <div className="flex-1">
          {label && <span className="text-sm font-medium text-text-primary">{label}</span>}
          {description && <p className="mt-0.5 text-xs text-text-secondary">{description}</p>}
        </div>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-accent' : 'bg-border-default'
        } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-full bg-surface-card shadow transition-transform ${
            checked ? 'left-6' : 'left-1'
          }`}
        />
      </button>
    </label>
  )
}
