type SwitchProps = {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  label?: string
  description?: string
  // timer: 늘 어두운 타이머 시트 위에서 쓴다(테마와 무관한 timer-* 토큰만)
  tone?: 'surface' | 'timer'
  // 줄(label)에 더할 클래스. 설정 행처럼 줄 높이를 터치 영역으로 쓸 때 준다
  className?: string
  // 스위치 밖에 둔 설명 글의 id(aria-describedby)
  describedBy?: string
}

const TONE = {
  surface: {
    row: '',
    // 설정 목록의 다른 행(ListRow) 라벨과 같은 굵기
    label: 'text-text-primary',
    description: 'text-text-secondary',
    on: 'bg-accent',
    off: 'bg-control-off',
    knob: 'bg-surface-card',
  },
  timer: {
    // 줄 전체가 label이라 줄 높이가 곧 터치 영역이다
    row: 'min-h-11',
    label: 'font-medium text-timer-modal-text',
    description: 'text-timer-modal-secondary',
    on: 'bg-timer-accent',
    off: 'bg-timer-btn-hover',
    knob: 'bg-timer-focus-text',
  },
}

export function Switch({ checked, onChange, disabled, label, description, tone = 'surface', className = '', describedBy }: SwitchProps) {
  const t = TONE[tone]
  return (
    <label className={`flex cursor-pointer items-center justify-between gap-3 ${t.row} ${className}`}>
      {(label || description) && (
        <div className="flex-1">
          {label && <span className={`text-sm ${t.label}`}>{label}</span>}
          {description && <p className={`mt-tight text-xs ${t.description}`}>{description}</p>}
        </div>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={describedBy}
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
          checked ? t.on : t.off
        } ${tone === 'timer' ? 'outline-timer-focus-ring' : ''} ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-full ${t.knob} transition-transform ${
            checked ? 'left-6' : 'left-1'
          }`}
        />
      </button>
    </label>
  )
}
