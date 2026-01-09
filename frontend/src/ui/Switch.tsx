type SwitchProps = {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  label?: string
  description?: string
}

export function Switch({ checked, onChange, disabled, label, description }: SwitchProps) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4">
      {(label || description) && (
        <div className="flex-1">
          {label && <span className="text-sm text-gray-900">{label}</span>}
          {description && <p className="text-xs text-gray-400">{description}</p>}
        </div>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-emerald-500' : 'bg-gray-200'
        } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? 'left-6' : 'left-1'
          }`}
        />
      </button>
    </label>
  )
}
