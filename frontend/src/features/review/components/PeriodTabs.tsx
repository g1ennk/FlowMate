import type { PeriodType } from '../reviewTypes'

const TABS: Array<{ value: PeriodType; label: string }> = [
  { value: 'daily', label: '일일' },
  { value: 'weekly', label: '주간' },
  { value: 'monthly', label: '월간' },
]

type PeriodTabsProps = {
  value: PeriodType
  onChange: (value: PeriodType) => void
}

export function PeriodTabs({ value, onChange }: PeriodTabsProps) {
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-surface-card p-2 shadow-sm">
      {TABS.map((tab) => {
        const isActive = value === tab.value
        return (
          <button
            key={tab.value}
            type="button"
            onClick={() => onChange(tab.value)}
            className={`flex-1 rounded-xl transition-colors ${
              isActive
                ? 'bg-accent px-3 py-2.5 text-sm font-bold text-text-inverse'
                : 'bg-surface-sunken px-3 py-2 text-sm font-medium text-text-secondary hover:bg-hover-strong'
            }`}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
