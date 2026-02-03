import type { PeriodType } from '../reviewTypes'

const TABS: Array<{ value: PeriodType; label: string }> = [
  { value: 'daily', label: '오늘' },
  { value: 'weekly', label: '주간' },
  { value: 'monthly', label: '월간' },
  { value: 'yearly', label: '연간' },
]

type PeriodTabsProps = {
  value: PeriodType
  onChange: (value: PeriodType) => void
}

export function PeriodTabs({ value, onChange }: PeriodTabsProps) {
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-white p-2 shadow-sm">
      {TABS.map((tab) => {
        const isActive = value === tab.value
        return (
          <button
            key={tab.value}
            type="button"
            onClick={() => onChange(tab.value)}
            className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
              isActive
                ? 'bg-emerald-500 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
