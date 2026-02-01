import { useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import { BottomSheet, BottomSheetItem } from '../../ui/BottomSheet'
import { CheckIcon } from '../../ui/Icons'
import { Switch } from '../../ui/Switch'
import { type PomodoroSettings } from '../../api/types'
import { usePomodoroSettings, useUpdatePomodoroSettings } from './hooks'

const FLOW_PRESETS = [15, 20, 25, 30, 45, 50, 60, 90]
const SHORT_BREAK_PRESETS = [5, 10, 15, 20, 30]
const LONG_BREAK_PRESETS = [15, 20, 30]
const CYCLE_PRESETS = Array.from({ length: 10 }, (_, index) => index + 1)

const defaultSettings: PomodoroSettings = {
  flowMin: 25,
  breakMin: 5,
  longBreakMin: 15,
  cycleEvery: 4,
  autoStartBreak: false,
  autoStartSession: false,
}

type SettingsRowProps = {
  label: string
  value: string
  onClick: () => void
  disabled?: boolean
}

function SettingsRow({ label, value, onClick, disabled = false }: SettingsRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center justify-between px-4 py-3.5 text-left transition-colors ${
        disabled ? 'cursor-not-allowed text-gray-400' : 'hover:bg-gray-50'
      }`}
    >
      <span className={`text-sm ${disabled ? 'text-gray-400' : 'text-gray-900'}`}>{label}</span>
      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
        disabled ? 'bg-gray-50 text-gray-400' : 'bg-emerald-50 text-emerald-700'
      }`}>
        {value}
      </span>
    </button>
  )
}

// 사용자 지정 모달은 다음 버전에서 공개

function PomodoroSettingsPage() {
  const { data, isLoading } = usePomodoroSettings()
  const updateSettings = useUpdatePomodoroSettings()
  const [overrides, setOverrides] = useState<Partial<PomodoroSettings>>({})
  const [activeSheet, setActiveSheet] = useState<null | 'flow' | 'break' | 'cycle'>(null)

  const values = useMemo(
    () => ({
      flowMin: data?.flowMin ?? defaultSettings.flowMin,
      breakMin: data?.breakMin ?? defaultSettings.breakMin,
      longBreakMin: data?.longBreakMin ?? defaultSettings.longBreakMin,
      cycleEvery: data?.cycleEvery ?? defaultSettings.cycleEvery,
      autoStartBreak: data?.autoStartBreak ?? defaultSettings.autoStartBreak,
      autoStartSession: data?.autoStartSession ?? defaultSettings.autoStartSession,
      ...overrides,
    }),
    [data, overrides],
  )

  const commitSettings = (next: Partial<PomodoroSettings>) => {
    setOverrides((prev) => ({ ...prev, ...next }))
    const updated = { ...values, ...next }
    updateSettings.mutate(updated, {
      onSuccess: () => toast.success('저장됨', { id: 'settings-saved' }),
    })
  }

  const handleToggle = (field: 'autoStartBreak' | 'autoStartSession') => {
    commitSettings({ [field]: !values[field] })
  }

  const breakValueLabel = `${values.breakMin}, ${values.longBreakMin}분`
  const cycleLabel = `${values.cycleEvery} 세션`


  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">설정</h1>
      </header>

      <section>
        <p className="mb-3 text-sm font-medium text-gray-500">뽀모도로 세션</p>
        <div className="divide-y divide-gray-100 rounded-2xl bg-white shadow-sm">
          <SettingsRow
            label="Flow 시간"
            value={`${values.flowMin}분`}
            onClick={() => setActiveSheet('flow')}
          />
          <SettingsRow
            label="휴식 시간"
            value={breakValueLabel}
            onClick={() => setActiveSheet('break')}
          />
          <SettingsRow
            label="주기"
            value={cycleLabel}
            onClick={() => setActiveSheet('cycle')}
          />
        </div>
      </section>

      <section>
        <p className="mb-3 text-sm font-medium text-gray-500">자동화</p>
        <div className="divide-y divide-gray-100 rounded-2xl bg-white shadow-sm">
          <div className="px-4 py-3.5">
            <Switch
              label="휴식 시간 자동 시작"
              description="Flow 종료 후 자동으로 휴식 시작"
              checked={values.autoStartBreak ?? false}
              onChange={() => handleToggle('autoStartBreak')}
              disabled={isLoading}
            />
          </div>
          <div className="px-4 py-3.5">
            <Switch
              label="세션 자동 시작"
              description="휴식 종료 후 자동으로 Flow 시작"
              checked={values.autoStartSession ?? false}
              onChange={() => handleToggle('autoStartSession')}
              disabled={isLoading}
            />
          </div>
        </div>
      </section>

      {/* 미니 데이 설정은 다음 버전에서 공개 */}

      <p className="text-center text-xs text-gray-400">Todo Flow v0.1.0</p>

      <BottomSheet
        isOpen={activeSheet === 'flow'}
        onClose={() => setActiveSheet(null)}
        title="Flow 시간"
      >
        {FLOW_PRESETS.map((preset) => (
          <BottomSheetItem
            key={preset}
            label={`${preset}분`}
            rightIcon={values.flowMin === preset ? (
              <CheckIcon className="h-4 w-4 text-emerald-500" />
            ) : undefined}
            onClick={() => {
              commitSettings({ flowMin: preset })
              setActiveSheet(null)
            }}
          />
        ))}
        {/* 사용자 지정은 다음 버전에서 공개 */}
      </BottomSheet>

      <BottomSheet
        isOpen={activeSheet === 'break'}
        onClose={() => setActiveSheet(null)}
        title="휴식 시간"
      >
        <p className="px-2 pb-2 pt-1 text-xs font-semibold text-gray-400">짧은 휴식</p>
        {SHORT_BREAK_PRESETS.map((preset) => (
          <BottomSheetItem
            key={`short-${preset}`}
            label={`${preset}분`}
            rightIcon={values.breakMin === preset ? (
              <CheckIcon className="h-4 w-4 text-emerald-500" />
            ) : undefined}
            onClick={() => {
              commitSettings({ breakMin: preset })
              setActiveSheet(null)
            }}
          />
        ))}
        <p className="px-2 pb-2 pt-4 text-xs font-semibold text-gray-400">긴 휴식</p>
        {LONG_BREAK_PRESETS.map((preset) => (
          <BottomSheetItem
            key={`long-${preset}`}
            label={`${preset}분`}
            rightIcon={values.longBreakMin === preset ? (
              <CheckIcon className="h-4 w-4 text-emerald-500" />
            ) : undefined}
            onClick={() => {
              commitSettings({ longBreakMin: preset })
              setActiveSheet(null)
            }}
          />
        ))}
        {/* 사용자 지정은 다음 버전에서 공개 */}
      </BottomSheet>

      <BottomSheet
        isOpen={activeSheet === 'cycle'}
        onClose={() => setActiveSheet(null)}
        title="주기"
      >
        {CYCLE_PRESETS.map((preset) => (
          <BottomSheetItem
            key={preset}
            label={`${preset} 세션`}
            rightIcon={values.cycleEvery === preset ? (
              <CheckIcon className="h-4 w-4 text-emerald-500" />
            ) : undefined}
            onClick={() => {
              commitSettings({ cycleEvery: preset })
              setActiveSheet(null)
            }}
          />
        ))}
      </BottomSheet>


      {/* 사용자 지정 모달은 다음 버전에서 공개 */}

    </div>
  )
}

export default PomodoroSettingsPage
