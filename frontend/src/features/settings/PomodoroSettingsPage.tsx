import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../../store/authStore'
import { type Theme, useThemeStore } from '../../store/themeStore'
import { BottomSheet, BottomSheetItem } from '../../ui/BottomSheet'
import { Card } from '../../ui/Card'
import { CheckIcon, ChevronRightIcon } from '../../ui/Icons'
import { InlineStatus } from '../../ui/InlineStatus'
import { ListRow } from '../../ui/ListRow'
import { PageHeader } from '../../ui/PageHeader'
import { SectionHeader } from '../../ui/SectionHeader'
import { SegmentToggle } from '../../ui/SegmentToggle'
import { Switch } from '../../ui/Switch'
import { TextField } from '../../ui/TextField'
import { type MiniDaysSettings, type PomodoroSettings } from '../../api/types'
import { buildPomodoroSave, useSettings, useUpdateMiniDaysSettings, useUpdatePomodoroSettings } from './hooks'
import { defaultMiniDaysSettings, type MiniDayRange, parseMiniDayTime, validateMiniDaysSettings } from '../../lib/miniDays'
import { DEFAULT_POMODORO_SETTINGS } from '../timer/timerDefaults'
import { authMessages, confirmMessages, systemMessages, toastMessages } from '../../lib/messages'
import { isWaitingOffline } from '../../lib/queryStatus'
import { formatClockTime, formatTimeRange } from '../../lib/time'
import { useConfirmSheet } from '../../ui/useConfirmSheet'

const FLOW_PRESETS = [15, 20, 25, 30, 45, 50, 60, 90, 120]
const SHORT_BREAK_PRESETS = [5, 10, 15, 20, 30]
const LONG_BREAK_PRESETS = [15, 20, 30, 45, 60]
const CYCLE_PRESETS = Array.from({ length: 10 }, (_, index) => index + 1)
// 시각 휠은 칸("시작 18:00")과 같은 24시간 표기다. 시작은 00–23시, 종료는 01–24시(24는 그날의 끝 24:00)
const START_HOUR_OPTIONS = Array.from({ length: 24 }, (_, index) => index)
const END_HOUR_OPTIONS = Array.from({ length: 24 }, (_, index) => index + 1)
const MINUTE_OPTIONS = Array.from({ length: 12 }, (_, index) => index * 5)
const THEME_OPTIONS: Array<{ label: string; value: Theme }> = [
  { label: '시스템', value: 'system' },
  { label: '라이트', value: 'light' },
  { label: '다크', value: 'dark' },
]
const WHEEL_SCROLL_END_COMMIT_DELAY_MS = 120
const WHEEL_LIVE_SELECT_BIAS = 0.35
// 휠 항목 한 칸. 터치 영역 44를 지킨다(§6-2)
const WHEEL_ITEM_HEIGHT = 44
const WHEEL_VISIBLE_COUNT = 5
const WHEEL_PADDING = (WHEEL_ITEM_HEIGHT * WHEEL_VISIBLE_COUNT - WHEEL_ITEM_HEIGHT) / 2

// 불러오지 못했거나 아직 불러오는 중인 값의 자리. 기본값으로 꾸며 실제 값처럼 보이지 않게 한다.
// "—"는 읽어 주지 않거나 "대시"로 읽으므로 보조 기술에는 "알 수 없음"으로 읽힌다
const MISSING_VALUE = (
  <>
    <span aria-hidden="true">—</span>
    <span className="sr-only">알 수 없음</span>
  </>
)

type SettingsRowProps = {
  label: string
  // null이면 값을 모른다(불러오는 중이거나 실패). 그때는 고를 수 없으니 버튼이 아닌 줄로 둔다
  value: string | null
  onClick: () => void
}

// 누르면 고르는 시트가 열리는 설정 한 줄: 라벨 + 값 + 화살표(48px).
// 값을 모르면 스위치 행(SwitchRow)과 같은 모양의 누를 수 없는 줄에 "—"만 둔다
function SettingsRow({ label, value, onClick }: SettingsRowProps) {
  if (value === null) {
    return <ListRow size="lg" label={label} trailing={MISSING_VALUE} />
  }
  return (
    <ListRow
      size="lg"
      label={label}
      onClick={onClick}
      trailing={
        <>
          <span className="whitespace-nowrap">{value}</span>
          <ChevronRightIcon className="h-4 w-4" />
        </>
      }
    />
  )
}

type SwitchRowProps = {
  label: string
  checked: boolean | null
  onChange: () => void
}

// 스위치 한 줄. 줄 전체가 label이라 줄 높이(48)가 곧 터치 영역이다.
// 값을 모르면(checked=null) 꺼진 스위치로 꾸미지 않고 값 자리에 "—"를 둔다
function SwitchRow({ label, checked, onChange }: SwitchRowProps) {
  if (checked === null) {
    return <ListRow size="lg" label={label} trailing={MISSING_VALUE} />
  }
  return (
    <div className="border-t border-border-subtle first:border-t-0">
      <Switch className="min-h-12" label={label} checked={checked} onChange={onChange} />
    </div>
  )
}

// "기본값 복원" 버튼은 값이 기본값이 되면 사라진다. 그 버튼에 있던 포커스가 body로 떨어지지 않게 섹션 첫 행으로 옮긴다.
// 복원을 확인했거나(requestFocus) 포커스가 이미 떨어졌을 때만 옮긴다
function useFocusSectionWhenResetHides(showReset: boolean) {
  const sectionRef = useRef<HTMLElement>(null)
  const shownBefore = useRef(showReset)
  const pending = useRef(false)
  useEffect(() => {
    const hid = shownBefore.current && !showReset
    shownBefore.current = showReset
    if (!hid) return
    const active = document.activeElement
    const focusLost = !active || active === document.body
    if (!pending.current && !focusLost) return
    pending.current = false
    sectionRef.current?.querySelector<HTMLElement>('button:not(:disabled), input:not(:disabled)')?.focus()
  }, [showReset])
  const requestFocus = () => {
    pending.current = true
  }
  return { sectionRef, requestFocus }
}

// 섹션 안 목록 카드. 행의 글자가 카드 안쪽 선(16px)에 맞는다
function RowsCard({ children }: { children: ReactNode }) {
  return (
    <Card padding="none" className="px-card py-tight">
      {children}
    </Card>
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

  // 상자 없이 열만 둔다. 고른 줄의 띠는 세 열 뒤에 하나로 깐다(시트의 휠 묶음)
  return (
    <div className="relative overflow-hidden" style={{ height: WHEEL_ITEM_HEIGHT * WHEEL_VISIBLE_COUNT }}>
      <div
        ref={scrollRef}
        role="group"
        aria-label={ariaLabel}
        className="relative h-full overflow-y-auto overscroll-contain snap-y snap-mandatory touch-pan-y"
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
              className={`flex w-full snap-center items-center justify-center text-sm font-medium transition-colors ${
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
  const settingsQuery = useSettings()
  const { data: settingsData, isError, isFetching, refetch } = settingsQuery
  // 오프라인으로 열어 아직 못 불러왔으면(paused) 값 자리만 비워 두지 않고 알린다. 연결되면 저절로 불러온다
  const settingsOffline = isWaitingOffline(settingsQuery)
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
  const { confirm, confirmSheet } = useConfirmSheet()
  const [activeSheet, setActiveSheet] = useState<null | 'flow' | 'break' | 'cycle'>(null)
  const [activeMiniDay, setActiveMiniDay] = useState<keyof MiniDaysSettings | null>(null)
  const [miniDayEditor, setMiniDayEditor] = useState<MiniDayRange>(defaultMiniDaysSettings.day1)
  const [miniDayEditField, setMiniDayEditField] = useState<'start' | 'end'>('start')
  const [timeDraft, setTimeDraft] = useState<{ hour: number; minute: number }>({ hour: 6, minute: 0 })
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

  const breakValueLabel = `짧은 ${values.breakMin}분, 긴 ${values.longBreakMin}분`
  const cycleLabel = `${values.cycleEvery}회`
  // 미니 데이 구간은 계획, 설정, 시트가 모두 "06:00–12:00" 한 형식이다(lib/time.ts)
  const formatMiniDayRange = (range: MiniDayRange) => formatTimeRange(range.start, range.end) || '미설정'

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

  const showSessionReset = canEdit && !isSessionDefault
  const showAutomationReset = canEdit && !isAutomationDefault
  const showMiniDaysReset = canEdit && !isMiniDaysDefault
  const { sectionRef: sessionSectionRef, requestFocus: requestSessionFocus } = useFocusSectionWhenResetHides(showSessionReset)
  const { sectionRef: automationSectionRef, requestFocus: requestAutomationFocus } = useFocusSectionWhenResetHides(showAutomationReset)
  const { sectionRef: miniDaysSectionRef, requestFocus: requestMiniDaysFocus } = useFocusSectionWhenResetHides(showMiniDaysReset)

  const openMiniDayEditor = (dayKey: keyof MiniDaysSettings) => {
    if (!canEdit) return
    const next = miniDaysBase[dayKey]
    setActiveMiniDay(dayKey)
    setMiniDayEditor(next)
    setMiniDayEditField('start')
    setTimeDraftFromValue(next.start, defaultMiniDaysSettings[dayKey].start)
  }

  // 닫을 때 바뀐 값이 있으면 저장한다. 오류가 있으면 바뀐 내용을 버리고 닫는다.
  const closeMiniDayEditor = () => {
    if (!activeMiniDay) return
    if (activeMiniDayError) {
      toast(toastMessages.miniDaysDiscarded, { id: 'mini-days-discarded' })
    } else if (isMiniDayDirty) {
      updateMiniDays.mutate(candidateMiniDays, {
        onSuccess: () => {
          toast.success(toastMessages.miniDaysSaved, { id: 'mini-days-saved' })
        },
      })
    }
    setActiveMiniDay(null)
  }

  // 시트를 연 채 화면을 떠나도(탭 이동 등) 유효한 변경은 저장한다.
  const unsavedMiniDaysRef = useRef<MiniDaysSettings | null>(null)
  const saveMiniDaysRef = useRef(updateMiniDays.mutate)
  useEffect(() => {
    unsavedMiniDaysRef.current =
      activeMiniDay && isMiniDayDirty && !activeMiniDayError ? candidateMiniDays : null
    saveMiniDaysRef.current = updateMiniDays.mutate
  })
  useEffect(() => () => {
    if (unsavedMiniDaysRef.current) saveMiniDaysRef.current(unsavedMiniDaysRef.current)
  }, [])

  const formatTime =(hours: number, minutes: number) => {
    const hh = String(hours).padStart(2, '0')
    const mm = String(minutes).padStart(2, '0')
    return `${hh}:${mm}`
  }

  // "HH:mm"을 휠 값으로 읽는다. 24:00(그날의 끝)은 24시 00분이다
  const parseTimeDraft = (value: string, fallback: string) => {
    const trimmed = value.trim() || fallback || '06:00'
    const [rawHours, rawMinutes] = trimmed.split(':')
    const hours = Number(rawHours)
    const minutes = Number(rawMinutes)
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return { hour: 6, minute: 0 }
    const hour = Math.max(0, Math.min(24, hours))
    return { hour, minute: hour === 24 ? 0 : Math.max(0, Math.min(59, minutes)) }
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
    updateMiniDayEditorField(miniDayEditField, formatTime(draft.hour, draft.minute))
  }

  const handleSelectMiniDayField = (field: 'start' | 'end') => {
    if (!activeMiniDay) return
    setMiniDayEditField(field)
    setTimeDraftFromValue(miniDayEditor[field], defaultMiniDaysSettings[activeMiniDay][field])
  }

  // 24시는 그날의 끝이라 분을 00으로 둔다
  const handleSelectHour = (hour: number) => {
    const next = { hour, minute: hour === 24 ? 0 : timeDraft.minute }
    setTimeDraft(next)
    commitTimeDraft(next)
  }

  const handleSelectMinute = (minute: number) => {
    const next = { ...timeDraft, minute: timeDraft.hour === 24 ? 0 : minute }
    setTimeDraft(next)
    commitTimeDraft(next)
  }

  const handleResetSessionDefaults = async () => {
    // 버튼은 기본값과 다를 때만 보인다. 그 사이 값이 기본값이 됐으면 아무것도 하지 않는다
    if (isSessionDefault) return
    if (!(await confirm(confirmMessages.resetSession))) return
    requestSessionFocus()
    commitSettings({
      flowMin: DEFAULT_POMODORO_SETTINGS.flowMin,
      breakMin: DEFAULT_POMODORO_SETTINGS.breakMin,
      longBreakMin: DEFAULT_POMODORO_SETTINGS.longBreakMin,
      cycleEvery: DEFAULT_POMODORO_SETTINGS.cycleEvery,
    })
  }

  const handleResetAutomationDefaults = async () => {
    // 버튼은 기본값과 다를 때만 보인다. 그 사이 값이 기본값이 됐으면 아무것도 하지 않는다
    if (isAutomationDefault) return
    if (!(await confirm(confirmMessages.resetAutomation))) return
    requestAutomationFocus()
    commitSettings({
      autoStartBreak: DEFAULT_POMODORO_SETTINGS.autoStartBreak,
      autoStartSession: DEFAULT_POMODORO_SETTINGS.autoStartSession,
    })
  }

  const handleResetMiniDaysDefaults = async () => {
    // 버튼은 기본값과 다를 때만 보인다. 그 사이 값이 기본값이 됐으면 아무것도 하지 않는다
    if (isMiniDaysDefault) return
    const defaultStarts = [defaultMiniDaysSettings.day1, defaultMiniDaysSettings.day2, defaultMiniDaysSettings.day3]
      .map((range) => formatClockTime(range.start))
      .join(', ')
    if (!(await confirm(confirmMessages.resetMiniDays(defaultStarts)))) return
    requestMiniDaysFocus()
    const resetPayload: MiniDaysSettings = {
      day1: { ...defaultMiniDaysSettings.day1 },
      day2: { ...defaultMiniDaysSettings.day2 },
      day3: { ...defaultMiniDaysSettings.day3 },
    }
    updateMiniDays.mutate(resetPayload, {
      onSuccess: () => {
        toast.success(toastMessages.miniDaysReset, { id: 'mini-days-reset-saved' })
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

  const startValueLabel = formatClockTime(miniDayEditor.start) || '--:--'
  const endValueLabel = formatClockTime(miniDayEditor.end) || '--:--'
  const startMinutes = parseMiniDayTime(miniDayEditor.start, false)
  const endMinutes = parseMiniDayTime(miniDayEditor.end, true)
  const hasValidRange = startMinutes !== null && endMinutes !== null && endMinutes > startMinutes
  const previewRange = formatTimeRange(miniDayEditor.start, miniDayEditor.end) || '--'
  const previewDuration = hasValidRange ? formatDuration(endMinutes - startMinutes) : '--'
  const activeMiniDayErrorMessage = activeMiniDayError === '시작은 종료보다 빨라야 해요'
    ? '종료는 시작보다 늦어야 해요'
    : activeMiniDayError
  const hourOptions = miniDayEditField === 'end' ? END_HOUR_OPTIONS : START_HOUR_OPTIONS
  const hourIndex = Math.max(0, hourOptions.indexOf(timeDraft.hour))
  // 24시(그날의 끝)는 24:00 하나뿐이라 분 휠에 00만 둔다. 12칸을 두면 돌려서 30에 멈춰도 값은 24:00이라 휠과 값이 어긋난다
  const minuteOptions = timeDraft.hour === 24 ? [0] : MINUTE_OPTIONS
  const minuteIndex = Math.max(0, minuteOptions.indexOf(timeDraft.minute))
  const hourItems = hourOptions.map((hour) => ({ value: hour, label: String(hour).padStart(2, '0') }))
  const minuteItems = minuteOptions.map((minute) => ({ value: minute, label: minute.toString().padStart(2, '0') }))
  const handleLogout = async () => {
    if (!(await confirm(confirmMessages.logout))) return
    await logout()
    queryClient.clear()
    navigate('/login', { replace: true })
  }

  // 서버 값을 모르는 동안(불러오는 중이거나 실패)에는 값 자리에 "—"를 두고 스위치를 숨긴다
  const shown = (text: string) => (settingsData ? text : null)

  return (
    <div className="space-y-section">
      <PageHeader title="설정" />

      {settingsOffline && <InlineStatus kind="waiting" message={systemMessages.offlineLoadFailed('설정')} />}

      {isError && !settingsData && (
        <InlineStatus
          message="설정을 불러오지 못했어요"
          actionLabel="다시 시도"
          onAction={() => void refetch()}
          actionDisabled={isFetching}
        />
      )}

      <section ref={sessionSectionRef}>
        <SectionHeader
          title="뽀모도로"
          description="새로 시작하는 타이머부터 적용돼요."
          actionLabel={showSessionReset ? '기본값 복원' : undefined}
          onAction={handleResetSessionDefaults}
          actionDisabled={updateSettings.isPending}
        />
        <RowsCard>
          <SettingsRow
            label="집중 시간"
            value={shown(`${values.flowMin}분`)}
            onClick={() => setActiveSheet('flow')}
          />
          <SettingsRow
            label="휴식 시간"
            value={shown(breakValueLabel)}
            onClick={() => setActiveSheet('break')}
          />
          <SettingsRow
            label="긴 휴식까지"
            value={shown(cycleLabel)}
            onClick={() => setActiveSheet('cycle')}
          />
        </RowsCard>
      </section>

      <section ref={automationSectionRef}>
        <SectionHeader
          title="자동화"
          description="집중과 휴식이 끝나면 다음을 자동으로 시작할지 정해요."
          actionLabel={showAutomationReset ? '기본값 복원' : undefined}
          onAction={handleResetAutomationDefaults}
          actionDisabled={updateSettings.isPending}
        />
        <RowsCard>
          <SwitchRow
            label="휴식 자동 시작"
            checked={settingsData ? values.autoStartBreak ?? false : null}
            onChange={() => handleToggle('autoStartBreak')}
          />
          <SwitchRow
            label="집중 자동 시작"
            checked={settingsData ? values.autoStartSession ?? false : null}
            onChange={() => handleToggle('autoStartSession')}
          />
        </RowsCard>
      </section>

      <section ref={miniDaysSectionRef}>
        <SectionHeader
          title="미니 데이"
          description="하루를 시간대별로 나누어 할 일을 정리할 수 있어요."
          actionLabel={showMiniDaysReset ? '기본값 복원' : undefined}
          onAction={handleResetMiniDaysDefaults}
          actionDisabled={updateMiniDays.isPending}
        />
        <RowsCard>
          {([
            { key: 'day1', title: miniDaysBase.day1.label, range: formatMiniDayRange(miniDaysBase.day1) },
            { key: 'day2', title: miniDaysBase.day2.label, range: formatMiniDayRange(miniDaysBase.day2) },
            { key: 'day3', title: miniDaysBase.day3.label, range: formatMiniDayRange(miniDaysBase.day3) },
          ] as const).map(({ key, title, range }) => (
            <SettingsRow
              key={key}
              label={title}
              value={shown(range)}
              onClick={() => openMiniDayEditor(key)}
            />
          ))}
        </RowsCard>
        <p className="mt-list break-keep text-xs text-text-secondary">
          미분류는 항상 있어요. 구간은 이어지지 않아도 되고, 겹치면 위 구간이 우선이에요.
        </p>
      </section>

      <section>
        <SectionHeader title="화면" />
        {/* 한 줄짜리라도 다른 묶음과 같게 카드에 담는다(통일성, 사용자 결정 2026-10-20) */}
        <RowsCard>
          <ListRow
            size="lg"
            label="테마"
            trailing={
              <SegmentToggle
                ariaLabel="화면 테마"
                options={THEME_OPTIONS}
                value={theme}
                onChange={setTheme}
              />
            }
          />
        </RowsCard>
      </section>

      {authState && (
        <section>
          <SectionHeader title="계정" />
          <RowsCard>
            {authState.type === 'member' ? (
              <>
                <ListRow size="lg" label={authState.user.nickname} description={authMessages.memberStatus} />
                <ListRow size="lg" label={authMessages.logout} onClick={handleLogout} />
              </>
            ) : (
              <>
                <ListRow size="lg" label={authMessages.guestStatus} description={authMessages.guestStatusNotice} />
                <ListRow
                  size="lg"
                  label={authMessages.kakaoLogin}
                  onClick={() => navigate('/login')}
                  trailing={<ChevronRightIcon className="h-4 w-4" />}
                />
              </>
            )}
          </RowsCard>
        </section>
      )}

      <BottomSheet
        isOpen={activeSheet === 'flow'}
        onClose={() => setActiveSheet(null)}
        title="집중 시간"
      >
        {FLOW_PRESETS.map((preset) => (
          <BottomSheetItem
            key={preset}
            label={`${preset}분`}
            selected={values.flowMin === preset}
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

      {/* 짧은 휴식과 긴 휴식을 한 시트에서 고른다. 하나를 골라도 닫지 않고 체크만 옮긴다(저장은 바로 한다) */}
      <BottomSheet
        isOpen={activeSheet === 'break'}
        onClose={() => setActiveSheet(null)}
        title="휴식 시간"
      >
        <div role="group" aria-labelledby="break-short-title">
          <SectionHeader id="break-short-title" title="짧은 휴식" size="sm" as="h3" className="pt-tight" />
          {SHORT_BREAK_PRESETS.map((preset) => (
            <BottomSheetItem
              key={`short-${preset}`}
              label={`${preset}분`}
              selected={values.breakMin === preset}
              rightIcon={values.breakMin === preset ? (
                <CheckIcon className="h-4 w-4 text-accent" />
              ) : undefined}
              onClick={() => commitSettings({ breakMin: preset })}
            />
          ))}
        </div>
        <div role="group" aria-labelledby="break-long-title">
          <SectionHeader id="break-long-title" title="긴 휴식" size="sm" as="h3" className="pt-card" />
          {LONG_BREAK_PRESETS.map((preset) => (
            <BottomSheetItem
              key={`long-${preset}`}
              label={`${preset}분`}
              selected={values.longBreakMin === preset}
              rightIcon={values.longBreakMin === preset ? (
                <CheckIcon className="h-4 w-4 text-accent" />
              ) : undefined}
              onClick={() => commitSettings({ longBreakMin: preset })}
            />
          ))}
        </div>
        {/* 사용자 지정은 다음 버전에서 공개 */}
      </BottomSheet>

      <BottomSheet
        isOpen={activeSheet === 'cycle'}
        onClose={() => setActiveSheet(null)}
        title="긴 휴식까지"
      >
        {CYCLE_PRESETS.map((preset) => (
          <BottomSheetItem
            key={preset}
            label={`${preset}회`}
            selected={values.cycleEvery === preset}
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
              <TextField
                aria-label="미니 데이 이름"
                value={miniDayEditor.label}
                onChange={(e) => updateMiniDayEditorField('label', e.target.value)}
                placeholder="미니 데이 1"
              />
              <p className="mt-list break-keep text-xs text-text-secondary">
                이름도 바꿀 수 있어요. 예: 오전/오후/저녁, 집중 시간, 회의 시간
              </p>
            </div>

            <div className="space-y-list">
              <SegmentToggle
                ariaLabel="고칠 시각"
                fullWidth
                options={[
                  { label: `시작 ${startValueLabel}`, value: 'start' },
                  { label: `종료 ${endValueLabel}`, value: 'end' },
                ]}
                value={miniDayEditField}
                onChange={handleSelectMiniDayField}
              />

              {activeMiniDayErrorMessage && (
                <p className="text-xs font-medium text-state-error-text">{activeMiniDayErrorMessage}</p>
              )}
            </div>

            {/* 시각 휠(24시간): 상자 없이 시와 분 두 열을 두고, 고른 줄은 두 열을 가로지르는 띠 하나로 보여 준다 */}
            <div className="relative grid grid-cols-2 gap-card-item">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 rounded-control bg-accent-subtle"
                style={{ height: WHEEL_ITEM_HEIGHT }}
              />
              <WheelColumn
                key={miniDayEditField}
                items={hourItems}
                selectedIndex={hourIndex}
                onSelectIndex={(index) => handleSelectHour(hourOptions[index])}
                ariaLabel="시 선택"
              />
              <WheelColumn
                // 칸 수가 바뀌면 스크롤 위치를 새로 잡도록 다시 그린다
                key={timeDraft.hour === 24 ? 'minute-end-of-day' : 'minute'}
                items={minuteItems}
                selectedIndex={minuteIndex}
                onSelectIndex={(index) => handleSelectMinute(minuteOptions[index])}
                ariaLabel="분 선택"
              />
            </div>

            <div className="text-center text-sm font-medium text-text-secondary">
              <span className="text-text-primary">{previewRange}</span>
              <span className="text-text-tertiary"> · </span>
              <span>{previewDuration}</span>
            </div>

            <p className={`text-center text-xs font-medium ${
              activeMiniDayErrorMessage ? 'text-state-error-text' : 'text-text-secondary'
            }`}>
              {activeMiniDayErrorMessage ? '오류를 고치지 않고 닫으면 저장되지 않아요' : '닫으면 자동으로 저장돼요'}
            </p>
          </div>
        </div>
      </BottomSheet>

      {confirmSheet}
    </div>
  )
}

export default PomodoroSettingsPage
