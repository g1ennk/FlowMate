import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../../store/authStore'
import { type Theme, useThemeStore } from '../../store/themeStore'
import { BottomSheet, BottomSheetItem } from '../../ui/BottomSheet'
import { CheckIcon, ChevronRightIcon } from '../../ui/Icons'
import { InlineSegmentToggle } from '../../ui/InlineSegmentToggle'
import { Switch } from '../../ui/Switch'
import { type MiniDaysSettings, type PomodoroSettings } from '../../api/types'
import { buildPomodoroSave, useSettings, useUpdateMiniDaysSettings, useUpdatePomodoroSettings } from './hooks'
import { defaultMiniDaysSettings, type MiniDayRange, parseMiniDayTime, validateMiniDaysSettings } from '../../lib/miniDays'
import { userTextInputClass } from '../../lib/userTextStyles'
import { DEFAULT_POMODORO_SETTINGS } from '../timer/timerDefaults'
import { useCoachMark } from '../../lib/useCoachMark'
import { CoachMark } from '../../ui/CoachMark'

const FLOW_PRESETS = [15, 20, 25, 30, 45, 50, 60, 90, 120]
const SHORT_BREAK_PRESETS = [5, 10, 15, 20, 30]
const LONG_BREAK_PRESETS = [15, 20, 30, 45, 60]
const CYCLE_PRESETS = Array.from({ length: 10 }, (_, index) => index + 1)
const HOUR_OPTIONS = Array.from({ length: 12 }, (_, index) => index + 1)
const MINUTE_OPTIONS = Array.from({ length: 12 }, (_, index) => index * 5)
const PERIOD_OPTIONS = [
  { value: 'am', label: '오전' },
  { value: 'pm', label: '오후' },
] as const
const THEME_OPTIONS: Array<{ label: string; value: Theme }> = [
  { label: '시스템', value: 'system' },
  { label: '라이트', value: 'light' },
  { label: '다크', value: 'dark' },
]
const WHEEL_SCROLL_END_COMMIT_DELAY_MS = 120
const WHEEL_LIVE_SELECT_BIAS = 0.35
const WHEEL_ITEM_HEIGHT = 40
const WHEEL_VISIBLE_COUNT = 5
const WHEEL_PADDING = (WHEEL_ITEM_HEIGHT * WHEEL_VISIBLE_COUNT - WHEEL_ITEM_HEIGHT) / 2

type SettingsRowProps = {
  label: string
  value: string
  onClick: () => void
  disabled?: boolean
}

type SectionHeaderProps = {
  title: string
  description?: string
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
        disabled ? 'cursor-not-allowed text-text-tertiary' : 'hover:bg-hover'
      }`}
    >
      <span className={`text-sm font-medium ${disabled ? 'text-text-tertiary' : 'text-text-primary'}`}>{label}</span>
      <span className="flex items-center gap-1.5">
        <span className={`text-sm ${disabled ? 'text-text-disabled' : 'text-text-secondary'}`}>{value}</span>
        <ChevronRightIcon className={`h-4 w-4 ${disabled ? 'text-text-disabled' : 'text-text-tertiary'}`} />
      </span>
    </button>
  )
}

function SectionHeader({
  title,
  description,
  actionLabel,
  onActionClick,
  actionDisabled = false,
}: SectionHeaderProps) {
  return (
    <div className="mb-card-item">
      <div className="flex items-center justify-between gap-card-item">
        <p className="text-sm font-medium text-text-secondary">{title}</p>
      {actionLabel && onActionClick && (
        <button
          type="button"
          onClick={onActionClick}
          disabled={actionDisabled}
          className="text-xs font-medium text-text-tertiary transition-colors hover:text-text-secondary disabled:cursor-not-allowed disabled:text-text-disabled"
        >
          {actionLabel}
        </button>
      )}
      </div>
      {description && (
        <p className="mt-1 text-xs text-text-tertiary">{description}</p>
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
    <div className="relative h-[200px] rounded-2xl bg-surface-base">
      <div className="pointer-events-none absolute inset-x-2 top-1/2 -translate-y-1/2 h-10 rounded-xl bg-accent-muted/50" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-10 rounded-t-2xl bg-gradient-to-b from-surface-base to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 rounded-b-2xl bg-gradient-to-t from-surface-base to-transparent" />
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
              className={`flex h-10 w-full snap-center items-center justify-center text-sm font-medium transition-colors ${
                isSelected ? 'text-accent-text' : 'text-text-tertiary'
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
  const { data: settingsData, isError, isFetching, refetch } = useSettings()
  // 서버 값을 불러오기 전에 편집하면 나머지 값이 기본값으로 덮어써지므로 막는다.
  const canEdit = !!settingsData
  const updateSettings = useUpdatePomodoroSettings()
  const updateMiniDays = useUpdateMiniDaysSettings()
  const logout = useAuthStore((s) => s.logout)
  const authState = useAuthStore((s) => s.state)
  const theme = useThemeStore((s) => s.theme)
  const setTheme = useThemeStore((s) => s.setTheme)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [activeSheet, setActiveSheet] = useState<null | 'flow' | 'break' | 'cycle'>(null)
  const [activeMiniDay, setActiveMiniDay] = useState<keyof MiniDaysSettings | null>(null)
  const [miniDayEditor, setMiniDayEditor] = useState<MiniDayRange>(defaultMiniDaysSettings.day1)
  const [miniDayEditField, setMiniDayEditField] = useState<'start' | 'end'>('start')
  const [timeDraft, setTimeDraft] = useState<{
    period: 'am' | 'pm'
    hour: number
    minute: number
  }>({ period: 'am', hour: 6, minute: 0 })
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
  // 저장 중인 미니 데이는 바로 보여주고, 다음 편집도 그 값 위에서 한다(PUT은 세 구간을 통째로 덮어쓴다).
  const miniDaysBase =
    (updateMiniDays.isPending ? updateMiniDays.variables : undefined)
    ?? settingsData?.miniDays
    ?? defaultMiniDaysSettings

  const values = useMemo(
    () => ({
      flowMin: data?.flowMin ?? DEFAULT_POMODORO_SETTINGS.flowMin,
      breakMin: data?.breakMin ?? DEFAULT_POMODORO_SETTINGS.breakMin,
      longBreakMin: data?.longBreakMin ?? DEFAULT_POMODORO_SETTINGS.longBreakMin,
      cycleEvery: data?.cycleEvery ?? DEFAULT_POMODORO_SETTINGS.cycleEvery,
      autoStartBreak: data?.autoStartBreak ?? DEFAULT_POMODORO_SETTINGS.autoStartBreak,
      autoStartSession: data?.autoStartSession ?? DEFAULT_POMODORO_SETTINGS.autoStartSession,
    }),
    [data],
  )

  const commitSettings = (next: Partial<PomodoroSettings>) => {
    if (!settingsData) return
    updateSettings.mutate(buildPomodoroSave(settingsData, next))
  }

  const handleToggle = (field: 'autoStartBreak' | 'autoStartSession') => {
    commitSettings({ [field]: !values[field] })
  }

  const breakValueLabel = `${values.breakMin}, ${values.longBreakMin}분`
  const cycleLabel = `${values.cycleEvery} 세션`
  const formatDisplayTime = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return '--:--'
    if (trimmed === '24:00') return '자정'
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
    values.flowMin === DEFAULT_POMODORO_SETTINGS.flowMin &&
    values.breakMin === DEFAULT_POMODORO_SETTINGS.breakMin &&
    values.longBreakMin === DEFAULT_POMODORO_SETTINGS.longBreakMin &&
    values.cycleEvery === DEFAULT_POMODORO_SETTINGS.cycleEvery

  const isAutomationDefault =
    values.autoStartBreak === DEFAULT_POMODORO_SETTINGS.autoStartBreak &&
    values.autoStartSession === DEFAULT_POMODORO_SETTINGS.autoStartSession

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
    if (!canEdit) return
    const next = miniDaysBase[dayKey]
    setActiveMiniDay(dayKey)
    setMiniDayEditor(next)
    setMiniDayEditField('start')
    setTimeDraftFromValue(next.start, defaultMiniDaysSettings[dayKey].start)
  }

  // 닫을 때 바뀐 값이 있으면 저장한다. 오류가 있으면 닫지 않고 오류 문구를 보여준다.
  const closeMiniDayEditor = () => {
    if (!activeMiniDay) return
    if (activeMiniDayError) return
    if (isMiniDayDirty) {
      updateMiniDays.mutate(candidateMiniDays, {
        onSuccess: () => {
          toast.success('저장됨', { id: 'mini-days-saved' })
        },
      })
    }
    setActiveMiniDay(null)
  }

  const formatTime = (hours: number, minutes: number) => {
    const hh = String(hours).padStart(2, '0')
    const mm = String(minutes).padStart(2, '0')
    return `${hh}:${mm}`
  }

  const parseTimeDraft = (value: string, fallback: string) => {
    const trimmed = value.trim() || fallback || '06:00'
    // 24:00(자정)은 휠에서 "오전 12:00"으로 보여준다.
    if (trimmed === '24:00') return { period: 'am' as const, hour: 12, minute: 0 }
    const [rawHours, rawMinutes] = trimmed.split(':')
    const hours = Number(rawHours)
    const minutes = Number(rawMinutes)
    if (Number.isNaN(hours) || Number.isNaN(minutes)) {
      return { period: 'am' as const, hour: 6, minute: 0 }
    }
    const safeHours = Math.max(0, Math.min(23, hours))
    const safeMinutes = Math.max(0, Math.min(59, minutes))
    const period: 'am' | 'pm' = safeHours >= 12 ? 'pm' : 'am'
    let hour12 = safeHours % 12
    if (hour12 === 0) hour12 = 12
    return { period, hour: hour12, minute: safeMinutes }
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
    const hour24 = draft.period === 'pm' ? (draft.hour % 12) + 12 : draft.hour % 12
    // 종료의 "오전 12:00"은 그날의 끝(자정)이므로 24:00으로 저장한다.
    if (miniDayEditField === 'end' && hour24 === 0 && draft.minute === 0) {
      updateMiniDayEditorField('end', '24:00')
      return
    }
    updateMiniDayEditorField(miniDayEditField, formatTime(hour24, draft.minute))
  }

  const handleSelectMiniDayField = (field: 'start' | 'end') => {
    if (!activeMiniDay) return
    setMiniDayEditField(field)
    setTimeDraftFromValue(miniDayEditor[field], defaultMiniDaysSettings[activeMiniDay][field])
  }

  const handleTogglePeriod = (period: 'am' | 'pm') => {
    const next = { ...timeDraft, period }
    setTimeDraft(next)
    commitTimeDraft(next)
  }

  const handleSelectHour = (hour: number) => {
    const next = { ...timeDraft, hour }
    setTimeDraft(next)
    commitTimeDraft(next)
  }

  const handleSelectMinute = (minute: number) => {
    const next = { ...timeDraft, minute }
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
      flowMin: DEFAULT_POMODORO_SETTINGS.flowMin,
      breakMin: DEFAULT_POMODORO_SETTINGS.breakMin,
      longBreakMin: DEFAULT_POMODORO_SETTINGS.longBreakMin,
      cycleEvery: DEFAULT_POMODORO_SETTINGS.cycleEvery,
    })
  }

  const handleResetAutomationDefaults = () => {
    if (isAutomationDefault) {
      toast('이미 기본값입니다', { id: 'automation-reset-noop' })
      return
    }
    if (!window.confirm('자동화 설정을 기본값으로 복원할까요?')) return
    commitSettings({
      autoStartBreak: DEFAULT_POMODORO_SETTINGS.autoStartBreak,
      autoStartSession: DEFAULT_POMODORO_SETTINGS.autoStartSession,
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
  const startMinutes = parseMiniDayTime(miniDayEditor.start, false)
  const endMinutes = parseMiniDayTime(miniDayEditor.end, true)
  const hasValidRange = startMinutes !== null && endMinutes !== null && endMinutes > startMinutes
  const previewRange = miniDayEditor.start.trim() && miniDayEditor.end.trim()
    ? `${formatDisplayTime(miniDayEditor.start)} ~ ${formatDisplayTime(miniDayEditor.end)}`
    : '--'
  const previewDuration = hasValidRange ? formatDuration(endMinutes - startMinutes) : '--'
  const activeMiniDayErrorMessage = activeMiniDayError === '시작은 종료보다 빨라야 해요'
    ? '종료는 시작보다 늦어야 해요'
    : activeMiniDayError
  const hourIndex = Math.max(0, HOUR_OPTIONS.indexOf(timeDraft.hour))
  const minuteIndex = Math.max(0, MINUTE_OPTIONS.indexOf(timeDraft.minute))
  const periodIndex = timeDraft.period === 'am' ? 0 : 1
  const hourItems = HOUR_OPTIONS.map((hour) => ({ value: hour, label: `${hour}` }))
  const minuteItems = MINUTE_OPTIONS.map((minute) => ({ value: minute, label: minute.toString().padStart(2, '0') }))
  const periodItems = PERIOD_OPTIONS.map((period) => ({ value: period.value, label: period.label }))
  const handleLogout = async () => {
    if (!window.confirm('로그아웃 할까요?')) return
    await logout()
    queryClient.clear()
    navigate('/login', { replace: true })
  }

  const settingsCoach = useCoachMark('settings-intro')

  return (
    <div className="animate-fade-in-up space-y-section">
      <header>
        <h1 className="text-2xl font-bold text-text-primary">설정</h1>
      </header>

      <CoachMark
        message={"뽀모도로 세션 길이와 미니 데이 시간대를 설정해보세요.\n미니 데이는 하루를 시간대별로 나누어 할 일을 정리하는 기능이에요."}
        visible={settingsCoach.visible}
        onDismiss={settingsCoach.dismiss}
      />

      {isError && !settingsData && (
        <div
          role="alert"
          className="flex items-center justify-between gap-card-item rounded-2xl bg-state-error-subtle px-4 py-3"
        >
          <p className="text-sm font-medium text-state-error">설정을 불러오지 못했어요</p>
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="shrink-0 rounded-lg px-2 py-1 text-sm font-semibold text-accent transition-colors hover:bg-accent-subtle disabled:cursor-not-allowed disabled:text-text-disabled"
          >
            다시 시도
          </button>
        </div>
      )}

      <section>
        <SectionHeader
          title="뽀모도로 세션"
          description="집중 시간, 휴식 시간, 긴 휴식까지 몇 번 집중할지 정해요. 진행 중인 타이머는 다음 시작부터 적용돼요."
          actionLabel="기본값 복원"
          onActionClick={handleResetSessionDefaults}
          actionDisabled={!canEdit || updateSettings.isPending || isSessionDefault}
        />
        <div className="space-y-1 rounded-2xl bg-surface-card p-1 shadow-sm">
          <SettingsRow
            label="Flow 시간"
            value={`${values.flowMin}분`}
            onClick={() => setActiveSheet('flow')}
            disabled={!canEdit}
          />
          <SettingsRow
            label="휴식 시간"
            value={breakValueLabel}
            onClick={() => setActiveSheet('break')}
            disabled={!canEdit}
          />
          <SettingsRow
            label="주기"
            value={cycleLabel}
            onClick={() => setActiveSheet('cycle')}
            disabled={!canEdit}
          />
        </div>
      </section>

      <section>
        <SectionHeader
          title="자동화"
          description="Flow와 휴식이 끝나면 다음을 자동으로 시작할지 정해요. 진행 중인 타이머는 다음 시작부터 적용돼요."
          actionLabel="기본값 복원"
          onActionClick={handleResetAutomationDefaults}
          actionDisabled={!canEdit || updateSettings.isPending || isAutomationDefault}
        />
        <div className="space-y-1 rounded-2xl bg-surface-card p-1 shadow-sm">
          <div className="rounded-xl px-3 py-3">
            <Switch
              label="휴식 시간 자동 시작"
              description="Flow 종료 후 자동으로 휴식 시작"
              checked={values.autoStartBreak ?? false}
              onChange={() => handleToggle('autoStartBreak')}
              disabled={!canEdit}
            />
          </div>
          <div className="rounded-xl px-3 py-3">
            <Switch
              label="세션 자동 시작"
              description="휴식 종료 후 자동으로 Flow 시작"
              checked={values.autoStartSession ?? false}
              onChange={() => handleToggle('autoStartSession')}
              disabled={!canEdit}
            />
          </div>
        </div>
      </section>

      <section>
        <SectionHeader
          title="미니 데이"
          description="하루를 시간대별로 나누어 할 일을 정리할 수 있어요."
          actionLabel="기본값 복원"
          onActionClick={handleResetMiniDaysDefaults}
          actionDisabled={!settingsData || updateMiniDays.isPending || isMiniDaysDefault}
        />
        <div className="space-y-1 rounded-2xl bg-surface-card p-1 shadow-sm">
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
              disabled={!canEdit}
            />
          ))}
        </div>
        <p className="mt-2 text-xs text-text-secondary">
          미분류는 고정이며, 시간 구간은 연속일 필요가 없습니다.
        </p>
      </section>

      <section>
        <SectionHeader title="화면" />
        <div className="rounded-2xl bg-surface-card p-1 shadow-sm">
          <div className="flex min-h-12 items-center justify-between gap-3 rounded-xl px-4 py-2.5">
            <span className="text-sm font-medium text-text-primary">화면 테마</span>
            <InlineSegmentToggle
              tone="surface"
              ariaLabel="화면 테마"
              options={THEME_OPTIONS}
              value={theme}
              onChange={(value) => setTheme(value as Theme)}
            />
          </div>
        </div>
      </section>

      {authState?.type === 'member' && (
        <section>
          <div className="rounded-2xl bg-surface-card p-1 shadow-sm">
            <button
              type="button"
              onClick={handleLogout}
              className="flex min-h-12 w-full items-center justify-center rounded-xl px-4 py-3.5 text-sm font-medium text-state-error transition-colors hover:bg-state-error-subtle"
            >
              로그아웃
            </button>
          </div>
        </section>
      )}

      {authState?.type === 'guest' && (
        <section>
          <div className="rounded-2xl bg-surface-card p-1 shadow-sm">
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="flex min-h-12 w-full items-center justify-center rounded-xl px-4 py-3.5 text-sm font-medium text-accent transition-colors hover:bg-accent-subtle"
            >
              로그인
            </button>
          </div>
        </section>
      )}

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
              <CheckIcon className="h-4 w-4 text-accent" />
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
        <p className="px-2 pb-2 pt-1 text-xs font-semibold text-text-tertiary">짧은 휴식</p>
        {SHORT_BREAK_PRESETS.map((preset) => (
          <BottomSheetItem
            key={`short-${preset}`}
            label={`${preset}분`}
            rightIcon={values.breakMin === preset ? (
              <CheckIcon className="h-4 w-4 text-accent" />
            ) : undefined}
            onClick={() => {
              commitSettings({ breakMin: preset })
              setActiveSheet(null)
            }}
          />
        ))}
        <p className="px-2 pb-2 pt-4 text-xs font-semibold text-text-tertiary">긴 휴식</p>
        {LONG_BREAK_PRESETS.map((preset) => (
          <BottomSheetItem
            key={`long-${preset}`}
            label={`${preset}분`}
            rightIcon={values.longBreakMin === preset ? (
              <CheckIcon className="h-4 w-4 text-accent" />
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
              <CheckIcon className="h-4 w-4 text-accent" />
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
      >
        <div className="space-y-card pb-6">
          <div
            className="sticky bottom-0 -mx-sheet space-y-card bg-surface-card px-sheet pt-3"
            style={{ paddingBottom: 'calc(20px + var(--safe-bottom))' }}
          >
            <div>
              <input
                type="text"
                value={miniDayEditor.label}
                onChange={(e) => updateMiniDayEditorField('label', e.target.value)}
                placeholder="미니 데이 1"
                className={`w-full rounded-xl border border-border-default bg-surface-card px-4 py-3 ${userTextInputClass} text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-subtle`}
              />
              <p className="mt-2 px-1 text-xs text-text-tertiary">
                이름도 바꿀 수 있어요. 예: 오전/오후/저녁, 집중 시간, 회의 시간
              </p>
            </div>

            <div className="space-y-list">
              <div className="rounded-2xl bg-surface-base p-1.5">
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleSelectMiniDayField('start')}
                    className={`rounded-xl border px-4 py-2.5 text-left transition-colors ${
                      miniDayEditField === 'start'
                        ? 'border-accent bg-surface-card shadow-sm'
                        : 'border-transparent text-text-secondary hover:bg-surface-card/70'
                    }`}
                  >
                    <p className={`text-xs font-medium ${
                      miniDayEditField === 'start' ? 'text-accent-text' : 'text-text-secondary'
                    }`}>
                      시작
                    </p>
                    <p className="mt-1 text-lg font-semibold text-text-primary">{startValueLabel}</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectMiniDayField('end')}
                    className={`rounded-xl border px-4 py-2.5 text-left transition-colors ${
                      miniDayEditField === 'end'
                        ? 'border-accent bg-surface-card shadow-sm'
                        : 'border-transparent text-text-secondary hover:bg-surface-card/70'
                    }`}
                  >
                    <p className={`text-xs font-medium ${
                      miniDayEditField === 'end' ? 'text-accent-text' : 'text-text-secondary'
                    }`}>
                      종료
                    </p>
                    <p className="mt-1 text-lg font-semibold text-text-primary">{endValueLabel}</p>
                  </button>
                </div>
              </div>

              {activeMiniDayErrorMessage && (
                <p className="text-xs font-medium text-state-error">{activeMiniDayErrorMessage}</p>
              )}
            </div>

            <div className="space-y-card-item rounded-2xl bg-surface-base px-3 py-3">
              <p className="text-xs font-medium text-text-secondary">
                {miniDayEditField === 'start' ? '시작 시간 선택' : '종료 시간 선택'}
              </p>

              <div className="grid grid-cols-3 gap-card-item">
                <div className="space-y-list">
                  <WheelColumn
                    items={periodItems}
                    selectedIndex={periodIndex}
                    onSelectIndex={(index) => handleTogglePeriod(PERIOD_OPTIONS[index].value)}
                    ariaLabel="오전 오후 선택"
                  />
                </div>
                <div className="space-y-list">
                  <WheelColumn
                    items={hourItems}
                    selectedIndex={hourIndex}
                    onSelectIndex={(index) => handleSelectHour(HOUR_OPTIONS[index])}
                    ariaLabel="시 선택"
                  />
                </div>
                <div className="space-y-list">
                  <WheelColumn
                    items={minuteItems}
                    selectedIndex={minuteIndex}
                    onSelectIndex={(index) => handleSelectMinute(MINUTE_OPTIONS[index])}
                    ariaLabel="분 선택"
                  />
                </div>
              </div>
            </div>

            <div className="text-center text-sm font-medium text-text-secondary">
              <span className="text-text-primary">{previewRange}</span>
              <span className="text-text-tertiary"> · </span>
              <span>{previewDuration}</span>
            </div>

            <p className={`text-center text-xs font-medium ${
              activeMiniDayErrorMessage ? 'text-state-error' : 'text-text-secondary'
            }`}>
              {activeMiniDayErrorMessage ? '오류를 고쳐야 닫을 수 있어요' : '닫으면 자동으로 저장돼요'}
            </p>
          </div>
        </div>
      </BottomSheet>
    </div>
  )
}

export default PomodoroSettingsPage
