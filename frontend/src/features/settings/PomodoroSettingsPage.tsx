import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { BottomSheet, BottomSheetItem } from '../../ui/BottomSheet'
import { CheckIcon, ChevronRightIcon } from '../../ui/Icons'
import { Switch } from '../../ui/Switch'
import { type MiniDaysSettings, type PomodoroSettings } from '../../api/types'
import { useMiniDaysSettings, usePomodoroSettings, useUpdateMiniDaysSettings, useUpdatePomodoroSettings } from './hooks'
import { defaultMiniDaysSettings, type MiniDayRange, validateMiniDaysSettings } from '../../lib/miniDays'

const FLOW_PRESETS = [15, 20, 25, 30, 45, 50, 60, 90]
const SHORT_BREAK_PRESETS = [5, 10, 15, 20, 30]
const LONG_BREAK_PRESETS = [15, 20, 30]
const CYCLE_PRESETS = Array.from({ length: 10 }, (_, index) => index + 1)
const HOUR_OPTIONS = Array.from({ length: 12 }, (_, index) => index + 1)
const MINUTE_OPTIONS = Array.from({ length: 12 }, (_, index) => index * 5)
const PERIOD_OPTIONS = ['AM', 'PM'] as const
const WHEEL_ITEM_HEIGHT = 40
const WHEEL_VISIBLE_COUNT = 5
const WHEEL_PADDING = (WHEEL_ITEM_HEIGHT * WHEEL_VISIBLE_COUNT - WHEEL_ITEM_HEIGHT) / 2

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

type WheelItem<T> = {
  value: T
  label: string
}

type WheelColumnProps<T> = {
  items: WheelItem<T>[]
  selectedIndex: number
  onSelectIndex: (index: number) => void
  ariaLabel: string
}

function WheelColumn<T>({ items, selectedIndex, onSelectIndex, ariaLabel }: WheelColumnProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const isProgrammaticScroll = useRef(false)

  useEffect(() => {
    const node = scrollRef.current
    if (!node) return
    const nextTop = selectedIndex * WHEEL_ITEM_HEIGHT
    if (Math.abs(node.scrollTop - nextTop) < 1) return
    isProgrammaticScroll.current = true
    node.scrollTo({ top: nextTop, behavior: 'smooth' })
    const timeout = window.setTimeout(() => {
      isProgrammaticScroll.current = false
    }, 120)
    return () => window.clearTimeout(timeout)
  }, [selectedIndex])

  const handleScroll = () => {
    const node = scrollRef.current
    if (!node || isProgrammaticScroll.current) return
    const index = Math.round(node.scrollTop / WHEEL_ITEM_HEIGHT)
    const clamped = Math.max(0, Math.min(items.length - 1, index))
    if (clamped !== selectedIndex) {
      onSelectIndex(clamped)
    }
  }

  return (
    <div className="relative h-[200px] rounded-2xl bg-white">
      <div className="pointer-events-none absolute inset-x-2 top-1/2 -translate-y-1/2 h-10 rounded-xl bg-emerald-100/70" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-10 rounded-t-2xl bg-gradient-to-b from-white to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 rounded-b-2xl bg-gradient-to-t from-white to-transparent" />
      <div
        ref={scrollRef}
        aria-label={ariaLabel}
        className="h-full overflow-y-auto scroll-smooth snap-y snap-mandatory"
        onScroll={handleScroll}
      >
        <div style={{ height: WHEEL_PADDING }} />
        {items.map((item, index) => {
          const isSelected = index === selectedIndex
          return (
            <button
              key={`${String(item.value)}-${index}`}
              type="button"
              onClick={() => onSelectIndex(index)}
              className={`flex h-10 w-full snap-center items-center justify-center text-sm font-semibold transition-colors ${
                isSelected ? 'text-emerald-700' : 'text-gray-400'
              }`}
              style={{ height: WHEEL_ITEM_HEIGHT }}
            >
              {item.label}
            </button>
          )
        })}
        <div style={{ height: WHEEL_PADDING }} />
      </div>
    </div>
  )
}

function PomodoroSettingsPage() {
  const { data, isLoading } = usePomodoroSettings()
  const { data: miniDaysData } = useMiniDaysSettings()
  const updateSettings = useUpdatePomodoroSettings()
  const updateMiniDays = useUpdateMiniDaysSettings()
  const [overrides, setOverrides] = useState<Partial<PomodoroSettings>>({})
  const [activeSheet, setActiveSheet] = useState<null | 'flow' | 'break' | 'cycle'>(null)
  const [activeMiniDay, setActiveMiniDay] = useState<keyof MiniDaysSettings | null>(null)
  const [miniDayEditor, setMiniDayEditor] = useState<MiniDayRange>(defaultMiniDaysSettings.day1)
  const [miniDayEditField, setMiniDayEditField] = useState<'start' | 'end'>('start')
  const [timeDraft, setTimeDraft] = useState<{
    period: 'am' | 'pm'
    hour: number
    minute: number
    is24: boolean
  }>({ period: 'am', hour: 6, minute: 0, is24: false })
  const miniDaysBase = miniDaysData ?? defaultMiniDaysSettings

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
  const formatMiniDayRange = (range: MiniDayRange) => {
    const start = range.start.trim()
    const end = range.end.trim()
    if (!start || !end) return '미설정'
    return `${start}–${end}`
  }

  const candidateMiniDays = useMemo(() => {
    if (!activeMiniDay) return miniDaysBase
    return { ...miniDaysBase, [activeMiniDay]: miniDayEditor }
  }, [activeMiniDay, miniDaysBase, miniDayEditor])

  const miniDaysErrors = useMemo(
    () => validateMiniDaysSettings(candidateMiniDays),
    [candidateMiniDays],
  )

  const activeMiniDayError = activeMiniDay ? miniDaysErrors[activeMiniDay] : null

  const isMiniDayDirty = useMemo(() => {
    if (!activeMiniDay) return false
    const current = miniDaysBase[activeMiniDay]
    return (
      current.label !== miniDayEditor.label ||
      current.start !== miniDayEditor.start ||
      current.end !== miniDayEditor.end
    )
  }, [activeMiniDay, miniDaysBase, miniDayEditor])

  const openMiniDayEditor = (dayKey: keyof MiniDaysSettings) => {
    const next = miniDaysBase[dayKey]
    setActiveMiniDay(dayKey)
    setMiniDayEditor(next)
    setMiniDayEditField('start')
    setTimeDraftFromValue(next.start, defaultMiniDaysSettings[dayKey].start)
  }

  const closeMiniDayEditor = () => {
    setActiveMiniDay(null)
  }

  const formatTime = (hours: number, minutes: number) => {
    const hh = String(hours).padStart(2, '0')
    const mm = String(minutes).padStart(2, '0')
    return `${hh}:${mm}`
  }

  const parseTimeDraft = (value: string, fallback: string) => {
    const trimmed = value.trim() || fallback || '06:00'
    if (trimmed === '24:00') return { period: 'pm' as const, hour: 12, minute: 0, is24: true }
    const [rawHours, rawMinutes] = trimmed.split(':')
    const hours = Number(rawHours)
    const minutes = Number(rawMinutes)
    if (Number.isNaN(hours) || Number.isNaN(minutes)) {
      return { period: 'am' as const, hour: 6, minute: 0, is24: false }
    }
    const safeHours = Math.max(0, Math.min(23, hours))
    const safeMinutes = Math.max(0, Math.min(59, minutes))
    const period: 'am' | 'pm' = safeHours >= 12 ? 'pm' : 'am'
    let hour12 = safeHours % 12
    if (hour12 === 0) hour12 = 12
    return { period, hour: hour12, minute: safeMinutes, is24: false }
  }

  const updateMiniDayEditorField = (field: 'label' | 'start' | 'end', value: string) => {
    setMiniDayEditor((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  const setTimeDraftFromValue = (value: string, fallback: string) => {
    setTimeDraft(parseTimeDraft(value, fallback))
  }

  const commitTimeDraft = (draft: typeof timeDraft) => {
    if (draft.is24) {
      updateMiniDayEditorField(miniDayEditField, '24:00')
      return
    }
    const hour24 = draft.period === 'pm' ? (draft.hour % 12) + 12 : draft.hour % 12
    updateMiniDayEditorField(miniDayEditField, formatTime(hour24, draft.minute))
  }

  const handleSaveMiniDay = () => {
    if (!activeMiniDay) return
    if (activeMiniDayError) return
    if (!isMiniDayDirty) {
      closeMiniDayEditor()
      return
    }
    updateMiniDays.mutate(candidateMiniDays, {
      onSuccess: () => {
        toast.success('저장됨', { id: 'mini-days-saved' })
        closeMiniDayEditor()
      },
    })
  }

  const handleSelectMiniDayField = (field: 'start' | 'end') => {
    if (!activeMiniDay) return
    setMiniDayEditField(field)
    setTimeDraftFromValue(miniDayEditor[field], defaultMiniDaysSettings[activeMiniDay][field])
  }

  const handleTogglePeriod = (period: 'am' | 'pm') => {
    const next = { ...timeDraft, period, is24: false }
    setTimeDraft(next)
    commitTimeDraft(next)
  }

  const handleSelectHour = (hour: number) => {
    const next = {
      ...timeDraft,
      hour,
      is24: false,
    }
    setTimeDraft(next)
    commitTimeDraft(next)
  }

  const handleSelectMinute = (minute: number) => {
    const next = {
      ...timeDraft,
      minute,
      is24: false,
    }
    setTimeDraft(next)
    commitTimeDraft(next)
  }

  const handleSelectEndOfDay = () => {
    const next = { period: 'pm' as const, hour: 12, minute: 0, is24: true }
    setTimeDraft(next)
    commitTimeDraft(next)
  }

  const handleResetMiniDay = () => {
    if (!activeMiniDay) return
    const defaults = defaultMiniDaysSettings[activeMiniDay]
    setMiniDayEditor(defaults)
    setMiniDayEditField('start')
    setTimeDraftFromValue(defaults.start, defaults.start)
  }

  const parseTimeMinutes = (value: string, allow24: boolean) => {
    const trimmed = value.trim()
    if (!trimmed) return null
    if (allow24 && trimmed === '24:00') return 24 * 60
    const [rawHours, rawMinutes] = trimmed.split(':')
    const hours = Number(rawHours)
    const minutes = Number(rawMinutes)
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return null
    return hours * 60 + minutes
  }

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const remainder = minutes % 60
    if (hours <= 0 && remainder <= 0) return '0분'
    if (hours <= 0) return `${remainder}분`
    if (remainder === 0) return `${hours}시간`
    return `${hours}시간 ${remainder}분`
  }

  const startValueLabel = miniDayEditor.start.trim() || '--:--'
  const endValueLabel = miniDayEditor.end.trim() || '--:--'
  const selectedTimeLabel = miniDayEditField === 'start' ? startValueLabel : endValueLabel
  const activeFieldLabel = miniDayEditField === 'start' ? '시작' : '종료'
  const startMinutes = parseTimeMinutes(miniDayEditor.start, false)
  const endMinutes = parseTimeMinutes(miniDayEditor.end, activeMiniDay === 'day3')
  const hasValidRange = startMinutes !== null && endMinutes !== null && endMinutes > startMinutes
  const previewRange = miniDayEditor.start.trim() && miniDayEditor.end.trim()
    ? `${miniDayEditor.start} ~ ${miniDayEditor.end}`
    : '--'
  const previewDuration = hasValidRange ? formatDuration(endMinutes - startMinutes) : '--'
  const activeMiniDayErrorMessage = activeMiniDayError === '시작은 종료보다 빨라야 해요'
    ? '종료는 시작 이후여야 합니다'
    : activeMiniDayError
  const hourIndex = Math.max(0, HOUR_OPTIONS.indexOf(timeDraft.hour))
  const minuteIndex = Math.max(0, MINUTE_OPTIONS.indexOf(timeDraft.minute))
  const periodIndex = timeDraft.period === 'am' ? 0 : 1
  const hourItems = HOUR_OPTIONS.map((hour) => ({ value: hour, label: `${hour}` }))
  const minuteItems = MINUTE_OPTIONS.map((minute) => ({ value: minute, label: minute.toString().padStart(2, '0') }))
  const periodItems = PERIOD_OPTIONS.map((period) => ({ value: period, label: period }))
  const showEndOfDayOption = activeMiniDay === 'day3' && miniDayEditField === 'end'

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

      <section>
        <p className="mb-3 text-sm font-medium text-gray-500">미니 데이</p>
        <div className="divide-y divide-gray-100 rounded-2xl bg-white shadow-sm">
          {([
            { key: 'day1', title: miniDaysBase.day1.label, range: formatMiniDayRange(miniDaysBase.day1) },
            { key: 'day2', title: miniDaysBase.day2.label, range: formatMiniDayRange(miniDaysBase.day2) },
            { key: 'day3', title: miniDaysBase.day3.label, range: formatMiniDayRange(miniDaysBase.day3) },
          ] as const).map(({ key, title, range }) => (
            <SettingsRow
              key={key}
              label={title}
              value={range}
              onClick={() => openMiniDayEditor(key)}
            />
          ))}
        </div>
        <p className="mt-2 text-xs text-gray-400">
          미분류는 고정이며, 시간 구간은 연속일 필요가 없습니다.
        </p>
      </section>

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

      <BottomSheet
        isOpen={!!activeMiniDay}
        onClose={closeMiniDayEditor}
        hideHandle
        panelClassName="bg-[#fdfcfb] shadow-2xl"
        contentClassName="px-6 pb-0 pt-6"
      >
        <div className="space-y-5 pb-6">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center">
            <div />
            <h2 className="text-center text-lg font-semibold text-gray-900">미니 데이 설정</h2>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleResetMiniDay}
                className="text-xs font-semibold text-emerald-600 transition-colors hover:text-emerald-700"
              >
                초기화
              </button>
            </div>
          </div>

          <div>
            <input
              type="text"
              value={miniDayEditor.label}
              onChange={(e) => updateMiniDayEditorField('label', e.target.value)}
              placeholder="미니 데이 1"
              className="w-full rounded-2xl bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => handleSelectMiniDayField('start')}
              className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left transition-colors ${
                miniDayEditField === 'start'
                  ? 'bg-emerald-50/80'
                  : 'bg-gray-50'
              }`}
            >
              <div>
                <p className="text-xs font-medium text-gray-500">시작</p>
                <p className="mt-1 text-lg font-semibold text-gray-900">{startValueLabel}</p>
              </div>
              <span className={`flex h-6 w-6 items-center justify-center rounded-full ${
                miniDayEditField === 'start' ? 'bg-emerald-500 text-white' : 'text-gray-300'
              }`}>
                {miniDayEditField === 'start' ? (
                  <CheckIcon className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRightIcon className="h-4 w-4" />
                )}
              </span>
            </button>
            <button
              type="button"
              onClick={() => handleSelectMiniDayField('end')}
              className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left transition-colors ${
                miniDayEditField === 'end'
                  ? 'bg-emerald-50/80'
                  : 'bg-gray-50'
              }`}
            >
              <div>
                <p className="text-xs font-medium text-gray-500">종료</p>
                <p className="mt-1 text-lg font-semibold text-gray-900">{endValueLabel}</p>
              </div>
              <span className={`flex h-6 w-6 items-center justify-center rounded-full ${
                miniDayEditField === 'end' ? 'bg-emerald-500 text-white' : 'text-gray-300'
              }`}>
                {miniDayEditField === 'end' ? (
                  <CheckIcon className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRightIcon className="h-4 w-4" />
                )}
              </span>
            </button>
          </div>

          {activeMiniDayErrorMessage && (
            <div className="flex items-center gap-2 text-xs text-red-500">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              <span>{activeMiniDayErrorMessage}</span>
            </div>
          )}

          <div className="space-y-3 rounded-2xl bg-gray-50 px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                <CheckIcon className="h-3 w-3" />
                <span>{activeFieldLabel} {selectedTimeLabel}</span>
              </div>
              {showEndOfDayOption && (
                <button
                  type="button"
                  onClick={handleSelectEndOfDay}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                    timeDraft.is24
                      ? 'bg-emerald-500 text-white'
                      : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                  }`}
                >
                  하루 끝 24:00
                </button>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <WheelColumn
                  items={periodItems}
                  selectedIndex={periodIndex}
                  onSelectIndex={(index) => handleTogglePeriod(index === 0 ? 'am' : 'pm')}
                  ariaLabel="오전 오후 선택"
                />
              </div>
              <div className="space-y-2">
                <WheelColumn
                  items={hourItems}
                  selectedIndex={hourIndex}
                  onSelectIndex={(index) => handleSelectHour(HOUR_OPTIONS[index])}
                  ariaLabel="시 선택"
                />
              </div>
              <div className="space-y-2">
                <WheelColumn
                  items={minuteItems}
                  selectedIndex={minuteIndex}
                  onSelectIndex={(index) => handleSelectMinute(MINUTE_OPTIONS[index])}
                  ariaLabel="분 선택"
                />
              </div>
            </div>
          </div>

          <div className="text-center text-sm font-semibold text-gray-600">
            <span className="text-gray-900">{previewRange}</span>
            <span className="text-gray-400"> · </span>
            <span>{previewDuration}</span>
          </div>

          <div className="sticky bottom-0 -mx-6 bg-[#fdfcfb] px-6 pb-5 pt-4">
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={closeMiniDayEditor}
                className="rounded-xl bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-200"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSaveMiniDay}
                disabled={!!activeMiniDayErrorMessage || updateMiniDays.isPending || !isMiniDayDirty}
                className="rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      </BottomSheet>
    </div>
  )
}

export default PomodoroSettingsPage
