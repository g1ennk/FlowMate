import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { BottomSheet, BottomSheetItem } from '../../ui/BottomSheet'
import { CheckIcon, ChevronRightIcon } from '../../ui/Icons'
import { Switch } from '../../ui/Switch'
import { type MiniDaysSettings, type PomodoroSettings } from '../../api/types'
import { useSettings, useUpdateMiniDaysSettings, useUpdatePomodoroSettings } from './hooks'
import { defaultMiniDaysSettings, type MiniDayRange, validateMiniDaysSettings } from '../../lib/miniDays'
import { userTextInputClass } from '../../lib/userTextStyles'
import { usePwaInstall } from '../pwa/usePwaInstall'

const FLOW_PRESETS = [15, 20, 25, 30, 45, 50, 60, 90]
const SHORT_BREAK_PRESETS = [5, 10, 15, 20, 30]
const LONG_BREAK_PRESETS = [15, 20, 30]
const CYCLE_PRESETS = Array.from({ length: 10 }, (_, index) => index + 1)
const HOUR_OPTIONS = Array.from({ length: 12 }, (_, index) => index + 1)
const MINUTE_OPTIONS = Array.from({ length: 12 }, (_, index) => index * 5)
const PERIOD_OPTIONS = [
  { value: 'am', label: '오전' },
  { value: 'pm', label: '오후' },
] as const
const INSTALL_CARD_DISMISS_KEY = 'flowmate:settings:install-card-dismissed-until:v1'
const INSTALL_CARD_DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000
const WHEEL_SCROLL_END_COMMIT_DELAY_MS = 120
const WHEEL_LIVE_SELECT_BIAS = 0.35
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

const readInstallCardDismissed = () => {
  if (typeof window === 'undefined') return false
  try {
    const raw = window.localStorage.getItem(INSTALL_CARD_DISMISS_KEY)
    if (!raw) return false
    const dismissedUntil = Number(raw)
    if (!Number.isFinite(dismissedUntil)) {
      window.localStorage.removeItem(INSTALL_CARD_DISMISS_KEY)
      return false
    }
    if (dismissedUntil <= Date.now()) {
      window.localStorage.removeItem(INSTALL_CARD_DISMISS_KEY)
      return false
    }
    return true
  } catch {
    return false
  }
}

const persistInstallCardDismissed = () => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      INSTALL_CARD_DISMISS_KEY,
      String(Date.now() + INSTALL_CARD_DISMISS_TTL_MS),
    )
  } catch {
    // ignore localStorage write failures
  }
}

type SettingsRowProps = {
  label: string
  value: string
  onClick: () => void
  disabled?: boolean
}

type SectionHeaderProps = {
  title: string
  actionLabel?: string
  onActionClick?: () => void
  actionDisabled?: boolean
}

function SettingsRow({ label, value, onClick, disabled = false }: SettingsRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex min-h-12 w-full items-center justify-between rounded-xl px-4 py-3.5 text-left transition-colors ${
        disabled ? 'cursor-not-allowed text-gray-400' : 'hover:bg-gray-50'
      }`}
    >
      <span className={`text-sm font-medium ${disabled ? 'text-gray-400' : 'text-gray-900'}`}>{label}</span>
      <span className="flex items-center gap-1.5">
        <span className={`text-sm ${disabled ? 'text-gray-300' : 'text-gray-500'}`}>{value}</span>
        <ChevronRightIcon className={`h-4 w-4 ${disabled ? 'text-gray-300' : 'text-gray-300'}`} />
      </span>
    </button>
  )
}

function SectionHeader({
  title,
  actionLabel,
  onActionClick,
  actionDisabled = false,
}: SectionHeaderProps) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <p className="text-sm font-medium text-gray-500">{title}</p>
      {actionLabel && onActionClick && (
        <button
          type="button"
          onClick={onActionClick}
          disabled={actionDisabled}
          className="text-xs font-semibold text-gray-400 transition-colors hover:text-gray-600 disabled:cursor-not-allowed disabled:text-gray-300"
        >
          {actionLabel}
        </button>
      )}
    </div>
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
  const scrollEndTimeoutRef = useRef<number | null>(null)

  const commitScrollIndex = useCallback((snapToItem = false) => {
    const node = scrollRef.current
    if (!node) return
    const rawIndex = node.scrollTop / WHEEL_ITEM_HEIGHT
    const index = snapToItem
      ? Math.round(rawIndex)
      : Math.floor(rawIndex + WHEEL_LIVE_SELECT_BIAS)
    const clamped = Math.max(0, Math.min(items.length - 1, index))

    if (clamped !== selectedIndex) {
      onSelectIndex(clamped)
      return
    }

    if (snapToItem) {
      const nextTop = clamped * WHEEL_ITEM_HEIGHT
      if (Math.abs(node.scrollTop - nextTop) > 1) {
        node.scrollTop = nextTop
      }
    }
  }, [items.length, onSelectIndex, selectedIndex])

  useEffect(() => {
    const node = scrollRef.current
    if (!node) return
    const nextTop = selectedIndex * WHEEL_ITEM_HEIGHT
    if (Math.abs(node.scrollTop - nextTop) < 1) return
    isProgrammaticScroll.current = true
    node.scrollTop = nextTop
    const rafId = window.requestAnimationFrame(() => {
      isProgrammaticScroll.current = false
    })
    return () => window.cancelAnimationFrame(rafId)
  }, [selectedIndex])

  useEffect(() => {
    return () => {
      if (scrollEndTimeoutRef.current !== null) {
        window.clearTimeout(scrollEndTimeoutRef.current)
      }
    }
  }, [])

  const handleScroll = () => {
    const node = scrollRef.current
    if (!node || isProgrammaticScroll.current) return
    commitScrollIndex(false)
    if (scrollEndTimeoutRef.current !== null) {
      window.clearTimeout(scrollEndTimeoutRef.current)
    }
    scrollEndTimeoutRef.current = window.setTimeout(() => {
      scrollEndTimeoutRef.current = null
      commitScrollIndex(true)
    }, WHEEL_SCROLL_END_COMMIT_DELAY_MS)
  }

  const handleUserScrollStart = () => {
    // 사용자가 바로 드래그를 시작할 때 이전 programmatic 플래그가 남아 있으면
    // 스크롤 이벤트가 무시되는 체감을 줄인다.
    isProgrammaticScroll.current = false
  }

  const handleUserScrollEnd = () => {
    if (scrollEndTimeoutRef.current !== null) {
      window.clearTimeout(scrollEndTimeoutRef.current)
      scrollEndTimeoutRef.current = null
    }
    commitScrollIndex(true)
  }

  return (
    <div className="relative h-[200px] rounded-2xl bg-gray-50">
      <div className="pointer-events-none absolute inset-x-2 top-1/2 -translate-y-1/2 h-10 rounded-xl bg-emerald-100/50" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-10 rounded-t-2xl bg-gradient-to-b from-gray-50 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 rounded-b-2xl bg-gradient-to-t from-gray-50 to-transparent" />
      <div
        ref={scrollRef}
        aria-label={ariaLabel}
        className="h-full overflow-y-auto overscroll-contain snap-y snap-mandatory touch-pan-y"
        onScroll={handleScroll}
        onPointerDown={handleUserScrollStart}
        onPointerUp={handleUserScrollEnd}
        onPointerCancel={handleUserScrollEnd}
        style={{ WebkitOverflowScrolling: 'touch' }}
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
  const { data: settingsData, isLoading } = useSettings()
  const updateSettings = useUpdatePomodoroSettings()
  const updateMiniDays = useUpdateMiniDaysSettings()
  const { canInstall, isInstalled, isStandalone, isIos, isAndroid, promptInstall } = usePwaInstall()
  const [overrides, setOverrides] = useState<Partial<PomodoroSettings>>({})
  const [activeSheet, setActiveSheet] = useState<null | 'flow' | 'break' | 'cycle'>(null)
  const [activeMiniDay, setActiveMiniDay] = useState<keyof MiniDaysSettings | null>(null)
  const [miniDayEditor, setMiniDayEditor] = useState<MiniDayRange>(defaultMiniDaysSettings.day1)
  const [miniDayEditField, setMiniDayEditField] = useState<'start' | 'end'>('start')
  const [installCardDismissed, setInstallCardDismissed] = useState<boolean>(() => readInstallCardDismissed())
  const lastSettingsSavedToastAtRef = useRef(0)
  const [timeDraft, setTimeDraft] = useState<{
    period: 'am' | 'pm'
    hour: number
    minute: number
    is24: boolean
  }>({ period: 'am', hour: 6, minute: 0, is24: false })
  const data = useMemo(
    () =>
      settingsData
        ? {
            ...settingsData.pomodoroSession,
            autoStartBreak: settingsData.automation.autoStartBreak ?? false,
            autoStartSession: settingsData.automation.autoStartSession ?? false,
          }
        : undefined,
    [settingsData],
  )
  const miniDaysBase = settingsData?.miniDays ?? defaultMiniDaysSettings

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
    updateSettings.mutate(next, {
      onSuccess: () => {
        const now = Date.now()
        if (now - lastSettingsSavedToastAtRef.current < 700) return
        lastSettingsSavedToastAtRef.current = now
        toast.success('저장됨', { id: 'settings-saved' })
      },
    })
  }

  const handleToggle = (field: 'autoStartBreak' | 'autoStartSession') => {
    commitSettings({ [field]: !values[field] })
  }

  const breakValueLabel = `${values.breakMin}, ${values.longBreakMin}분`
  const cycleLabel = `${values.cycleEvery} 세션`
  const formatDisplayTime = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return '--:--'
    if (trimmed === '24:00') return '오후 12:00'
    const [rawHours, rawMinutes] = trimmed.split(':')
    const hours = Number(rawHours)
    const minutes = Number(rawMinutes)
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return trimmed
    const period = hours >= 12 ? '오후' : '오전'
    let hour12 = hours % 12
    if (hour12 === 0) hour12 = 12
    return `${period} ${hour12}:${String(minutes).padStart(2, '0')}`
  }

  const formatMiniDayRange = (range: MiniDayRange) => {
    const start = range.start.trim()
    const end = range.end.trim()
    if (!start || !end) return '미설정'
    return `${formatDisplayTime(start)}-${formatDisplayTime(end)}`
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

  const isSessionDefault =
    values.flowMin === defaultSettings.flowMin &&
    values.breakMin === defaultSettings.breakMin &&
    values.longBreakMin === defaultSettings.longBreakMin &&
    values.cycleEvery === defaultSettings.cycleEvery

  const isAutomationDefault =
    values.autoStartBreak === defaultSettings.autoStartBreak &&
    values.autoStartSession === defaultSettings.autoStartSession

  const isMiniDaysDefault = (Object.keys(defaultMiniDaysSettings) as Array<keyof MiniDaysSettings>).every((key) => {
    const current = miniDaysBase[key]
    const defaults = defaultMiniDaysSettings[key]
    return (
      current.label === defaults.label &&
      current.start === defaults.start &&
      current.end === defaults.end
    )
  })

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

  const handleResetSessionDefaults = () => {
    if (isSessionDefault) {
      toast('이미 기본값입니다', { id: 'session-reset-noop' })
      return
    }
    if (!window.confirm('뽀모도로 세션 설정을 기본값으로 복원할까요?')) return
    commitSettings({
      flowMin: defaultSettings.flowMin,
      breakMin: defaultSettings.breakMin,
      longBreakMin: defaultSettings.longBreakMin,
      cycleEvery: defaultSettings.cycleEvery,
    })
  }

  const handleResetAutomationDefaults = () => {
    if (isAutomationDefault) {
      toast('이미 기본값입니다', { id: 'automation-reset-noop' })
      return
    }
    if (!window.confirm('자동화 설정을 기본값으로 복원할까요?')) return
    commitSettings({
      autoStartBreak: defaultSettings.autoStartBreak,
      autoStartSession: defaultSettings.autoStartSession,
    })
  }

  const handleResetMiniDaysDefaults = () => {
    if (isMiniDaysDefault) {
      toast('이미 기본값입니다', { id: 'mini-days-reset-noop' })
      return
    }
    if (!window.confirm('미니 데이 전체 설정을 기본값(06:00 / 12:00 / 18:00 시작)으로 복원할까요?')) return
    const resetPayload: MiniDaysSettings = {
      day1: { ...defaultMiniDaysSettings.day1 },
      day2: { ...defaultMiniDaysSettings.day2 },
      day3: { ...defaultMiniDaysSettings.day3 },
    }
    updateMiniDays.mutate(resetPayload, {
      onSuccess: () => {
        toast.success('미니 데이 기본값으로 복원됨', { id: 'mini-days-reset-saved' })
        if (!activeMiniDay) return
        const defaults = defaultMiniDaysSettings[activeMiniDay]
        setMiniDayEditor({ ...defaults })
        setMiniDayEditField('start')
        setTimeDraftFromValue(defaults.start, defaults.start)
      },
    })
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

  const startValueLabel = formatDisplayTime(miniDayEditor.start)
  const endValueLabel = formatDisplayTime(miniDayEditor.end)
  const startMinutes = parseTimeMinutes(miniDayEditor.start, false)
  const endMinutes = parseTimeMinutes(miniDayEditor.end, true)
  const hasValidRange = startMinutes !== null && endMinutes !== null && endMinutes > startMinutes
  const previewRange = miniDayEditor.start.trim() && miniDayEditor.end.trim()
    ? `${formatDisplayTime(miniDayEditor.start)} ~ ${formatDisplayTime(miniDayEditor.end)}`
    : '--'
  const previewDuration = hasValidRange ? formatDuration(endMinutes - startMinutes) : '--'
  const activeMiniDayErrorMessage = activeMiniDayError === '시작은 종료보다 빨라야 해요'
    ? '종료는 시작 이후여야 합니다'
    : activeMiniDayError
  const miniDaySaveStateMessage = updateMiniDays.isPending
    ? '저장 중입니다...'
    : activeMiniDayErrorMessage
      ? '오류를 수정한 뒤 상단 저장을 눌러주세요'
      : isMiniDayDirty
        ? '상단 저장을 누르면 적용됩니다'
        : '변경한 뒤 상단 저장을 누르면 적용됩니다'
  const miniDaySaveStateTone = updateMiniDays.isPending
    ? 'text-emerald-600'
    : activeMiniDayErrorMessage
      ? 'text-red-500'
      : 'text-gray-500'
  const hourIndex = Math.max(0, HOUR_OPTIONS.indexOf(timeDraft.hour))
  const minuteIndex = Math.max(0, MINUTE_OPTIONS.indexOf(timeDraft.minute))
  const periodIndex = timeDraft.period === 'am' ? 0 : 1
  const hourItems = HOUR_OPTIONS.map((hour) => ({ value: hour, label: `${hour}` }))
  const minuteItems = MINUTE_OPTIONS.map((minute) => ({ value: minute, label: minute.toString().padStart(2, '0') }))
  const periodItems = PERIOD_OPTIONS.map((period) => ({ value: period.value, label: period.label }))
  const shouldShowInstallCard =
    !installCardDismissed &&
    !isInstalled &&
    !isStandalone &&
    (canInstall || isIos || isAndroid)

  const handleInstallApp = async () => {
    const result = await promptInstall()
    if (result === 'accepted') {
      toast.success('앱 설치가 완료되었습니다', { id: 'pwa-install-accepted' })
      setInstallCardDismissed(true)
      return
    }
    if (result === 'dismissed') {
      toast('설치를 취소했습니다', { id: 'pwa-install-dismissed' })
    }
  }

  const handleDismissInstallCard = () => {
    setInstallCardDismissed(true)
    persistInstallCardDismissed()
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">설정</h1>
      </header>

      <section>
        <SectionHeader
          title="뽀모도로 세션"
          actionLabel="기본값 복원"
          onActionClick={handleResetSessionDefaults}
          actionDisabled={isLoading || updateSettings.isPending || isSessionDefault}
        />
        <div className="space-y-1 rounded-2xl bg-white p-1 shadow-sm">
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
        <SectionHeader
          title="자동화"
          actionLabel="기본값 복원"
          onActionClick={handleResetAutomationDefaults}
          actionDisabled={isLoading || updateSettings.isPending || isAutomationDefault}
        />
        <div className="space-y-1 rounded-2xl bg-white p-1 shadow-sm">
          <div className="rounded-xl px-3 py-3">
            <Switch
              label="휴식 시간 자동 시작"
              description="Flow 종료 후 자동으로 휴식 시작"
              checked={values.autoStartBreak ?? false}
              onChange={() => handleToggle('autoStartBreak')}
              disabled={isLoading}
            />
          </div>
          <div className="rounded-xl px-3 py-3">
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
        <SectionHeader
          title="미니 데이"
          actionLabel="기본값 복원"
          onActionClick={handleResetMiniDaysDefaults}
          actionDisabled={!settingsData || updateMiniDays.isPending || isMiniDaysDefault}
        />
        <div className="space-y-1 rounded-2xl bg-white p-1 shadow-sm">
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
        <p className="mt-2 text-xs text-gray-500">
          미분류는 고정이며, 시간 구간은 연속일 필요가 없습니다.
        </p>
      </section>

      {shouldShowInstallCard && (
        <section>
          <p className="mb-3 text-sm font-medium text-gray-500">앱 설치</p>
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-sm font-semibold text-gray-900">FlowMate 앱을 홈 화면에 설치하세요</p>
            <p className="mt-1 text-xs text-gray-500">
              앱처럼 실행하고 오프라인에서도 기본 화면을 열 수 있습니다.
            </p>

            {canInstall && (
              <button
                type="button"
                onClick={handleInstallApp}
                className="mt-3 w-full rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-600"
              >
                앱 설치
              </button>
            )}

            <div className="mt-3 space-y-3">
              <div className={`rounded-xl border p-3 ${
                isIos ? 'border-emerald-200 bg-emerald-50/40' : 'border-gray-100 bg-gray-50'
              }`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-gray-900">iPhone / iPad (Safari)</p>
                  {isIos && <span className="text-[10px] font-semibold text-emerald-700">현재 기기</span>}
                </div>
                <ol className="mt-2 space-y-1 pl-4 text-xs text-gray-600 list-decimal">
                  <li>Safari 하단의 공유 버튼을 누르세요</li>
                  <li>홈 화면에 추가를 선택하세요</li>
                  <li>추가를 눌러 설치를 완료하세요</li>
                </ol>
              </div>

              <div className={`rounded-xl border p-3 ${
                isAndroid ? 'border-emerald-200 bg-emerald-50/40' : 'border-gray-100 bg-gray-50'
              }`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-gray-900">Android (Chrome)</p>
                  {isAndroid && <span className="text-[10px] font-semibold text-emerald-700">현재 기기</span>}
                </div>
                <ol className="mt-2 space-y-1 pl-4 text-xs text-gray-600 list-decimal">
                  <li>브라우저 메뉴(⋮)를 여세요</li>
                  <li>앱 설치 또는 홈 화면에 추가를 선택하세요</li>
                  <li>설치/추가를 눌러 완료하세요</li>
                </ol>
              </div>
            </div>

            <button
              type="button"
              onClick={handleDismissInstallCard}
              className="mt-3 text-xs font-medium text-gray-400 transition-colors hover:text-gray-600"
            >
              일주일 동안 숨기기
            </button>
          </div>
        </section>
      )}

      <p className="text-center text-xs text-gray-400">FlowMate v1.0.0</p>

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
        title="미니 데이 설정"
        panelClassName="min-h-[50dvh]"
        contentClassName="pb-0 pt-4"
        headerAction={(
          <button
            type="button"
            onClick={handleSaveMiniDay}
            disabled={!!activeMiniDayErrorMessage || updateMiniDays.isPending || !isMiniDayDirty}
            className="rounded-lg px-2 py-1 text-sm font-semibold text-emerald-600 transition-colors hover:bg-emerald-50 hover:text-emerald-700 disabled:cursor-not-allowed disabled:text-gray-300 disabled:hover:bg-transparent"
          >
            저장
          </button>
        )}
      >
        <div className="space-y-4 pb-6">
          <div
            className="sticky bottom-0 -mx-5 space-y-4 bg-white px-5 pt-3"
            style={{ paddingBottom: 'calc(20px + var(--safe-bottom))' }}
          >
            <div>
              <input
                type="text"
                value={miniDayEditor.label}
                onChange={(e) => updateMiniDayEditorField('label', e.target.value)}
                placeholder="미니 데이 1"
                className={`w-full rounded-xl border border-gray-200 bg-white px-4 py-3 ${userTextInputClass} text-gray-900 placeholder:text-gray-400 focus:border-emerald-200 focus:outline-none focus:ring-2 focus:ring-emerald-100`}
              />
              <p className="mt-2 px-1 text-xs text-gray-400">
                이름도 바꿀 수 있어요. 예: 오전/오후/저녁, 집중 시간, 회의 시간
              </p>
            </div>

            <div className="space-y-2">
              <div className="rounded-2xl bg-gray-50 p-1.5">
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleSelectMiniDayField('start')}
                    className={`rounded-xl border px-4 py-2.5 text-left transition-colors ${
                      miniDayEditField === 'start'
                        ? 'border-emerald-200 bg-white shadow-sm'
                        : 'border-transparent text-gray-500 hover:bg-white/70'
                    }`}
                  >
                    <p className={`text-xs font-medium ${
                      miniDayEditField === 'start' ? 'text-emerald-700' : 'text-gray-500'
                    }`}>
                      시작
                    </p>
                    <p className="mt-1 text-lg font-semibold text-gray-900">{startValueLabel}</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectMiniDayField('end')}
                    className={`rounded-xl border px-4 py-2.5 text-left transition-colors ${
                      miniDayEditField === 'end'
                        ? 'border-emerald-200 bg-white shadow-sm'
                        : 'border-transparent text-gray-500 hover:bg-white/70'
                    }`}
                  >
                    <p className={`text-xs font-medium ${
                      miniDayEditField === 'end' ? 'text-emerald-700' : 'text-gray-500'
                    }`}>
                      종료
                    </p>
                    <p className="mt-1 text-lg font-semibold text-gray-900">{endValueLabel}</p>
                  </button>
                </div>
              </div>

              {activeMiniDayErrorMessage && (
                <p className="text-xs font-medium text-red-500">{activeMiniDayErrorMessage}</p>
              )}
            </div>

            <div className="space-y-3 rounded-2xl bg-gray-50 px-3 py-3">
              <p className="text-xs font-medium text-gray-500">
                {miniDayEditField === 'start' ? '시작 시간 선택' : '종료 시간 선택'}
              </p>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <WheelColumn
                    items={periodItems}
                    selectedIndex={periodIndex}
                    onSelectIndex={(index) => handleTogglePeriod(PERIOD_OPTIONS[index].value)}
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

            <div className="text-center text-sm font-medium text-gray-700">
              <span className="text-gray-900">{previewRange}</span>
              <span className="text-gray-400"> · </span>
              <span>{previewDuration}</span>
            </div>

            <p className={`text-center text-xs font-medium ${miniDaySaveStateTone}`}>
              {miniDaySaveStateMessage}
            </p>
          </div>
        </div>
      </BottomSheet>
    </div>
  )
}

export default PomodoroSettingsPage
