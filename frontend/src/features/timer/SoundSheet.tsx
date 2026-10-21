import { BottomSheet } from '../../ui/BottomSheet'
import { Button } from '../../ui/Button'
import { SectionHeader } from '../../ui/SectionHeader'
import {
  BALANCE_LABELS,
  DEFAULT_PRESET_ID,
  SOUND_PRESETS,
  findPreset,
  type SoundPreset,
} from './soundCatalog'
import type { ChannelKey } from './soundEngine'
import { SoundSlider, THUMB_INSET_CLASS } from './SoundSlider'
import { useSoundscapeStore } from './soundscapeStore'

// 타이머 위에서 여는 사운드 시트. 늘 어두운 timer 면이고 timer-* 토큰만 쓴다(.impeccable.md §4-3).
// 분위기와 음악/환경음 비율을 다룬다. 켜기/끄기와 볼륨은 타이머 화면 사운드 줄에 있다.

type SoundSheetProps = {
  isOpen: boolean
  onClose: () => void
}

const BALANCE_STOPS = [0, 0.25, 0.5, 0.75, 1]

function SectionTitle({ children, trailing }: { children: string; trailing?: string }) {
  return <SectionHeader title={children} meta={trailing} size="sm" tone="timer" as="h3" />
}

function moodChannels(preset: SoundPreset): ChannelKey[] {
  return ['music', ...preset.ambients.map((a) => `ambient:${a.id}` as const)]
}

export function SoundSheet({ isOpen, onClose }: SoundSheetProps) {
  const presetId = useSoundscapeStore((s) => s.presetId)
  const balance = useSoundscapeStore((s) => s.balance)
  const failed = useSoundscapeStore((s) => s.failed)
  const enabled = useSoundscapeStore((s) => s.enabled)
  const setEnabled = useSoundscapeStore((s) => s.setEnabled)
  const applyPreset = useSoundscapeStore((s) => s.applyPreset)
  const setBalance = useSoundscapeStore((s) => s.setBalance)
  const resetPrefs = useSoundscapeStore((s) => s.resetPrefs)

  const selected = findPreset(presetId) ?? findPreset(DEFAULT_PRESET_ID) ?? SOUND_PRESETS[0]
  const someFailed = moodChannels(selected).some((channel) => failed.includes(channel))

  // 분위기는 한 번에 끝나야 한다: 꺼져 있으면 같은 탭 안에서 켠다
  function handleMood(id: string) {
    applyPreset(id)
    if (!enabled) setEnabled(true)
  }

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title="사운드"
      tone="timer"
      zIndex={10000}
      headerAction={(
        <Button variant="ghost" size="sm" tone="timer" onClick={resetPrefs} aria-label="사운드 설정 초기화">
          초기화
        </Button>
      )}
    >
      {/* 묶음 사이는 section 20(세션 상세 시트와 같다, Task 21) */}
      <div className="flex flex-col gap-section pb-4">
        <section>
          <SectionTitle>분위기</SectionTitle>
          <div className="grid grid-cols-3 gap-2">
            {SOUND_PRESETS.map((preset) => {
              const active = preset.id === selected.id
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleMood(preset.id)}
                  aria-pressed={active}
                  className={`flex min-h-12 items-center justify-center rounded-control border px-2 py-2 text-center text-sm font-semibold break-keep transition-colors outline-timer-focus-ring ${
                    active
                      ? 'border-timer-accent bg-timer-accent/10 text-timer-accent'
                      : 'border-timer-btn-hover text-timer-modal-text hover:bg-timer-btn'
                  }`}
                >
                  {preset.label}
                </button>
              )
            })}
          </div>
          {someFailed && (
            <p className="mt-2 text-xs text-timer-modal-secondary">일부 소리를 불러오지 못했어요</p>
          )}
        </section>

        <section>
          <SectionTitle trailing={BALANCE_LABELS[balance]}>음악과 환경음</SectionTitle>
          <SoundSlider
            min={0}
            max={1}
            step={0.25}
            value={balance}
            onChange={(e) => setBalance(Number(e.target.value))}
            aria-label="음악과 환경음 비율"
            aria-valuetext={BALANCE_LABELS[balance]}
          />
          <div aria-hidden="true" className={`relative ${THUMB_INSET_CLASS} h-3`}>
            {BALANCE_STOPS.map((stop) => (
              <span
                key={stop}
                data-testid="balance-tick"
                style={{ left: `${stop * 100}%` }}
                className={`absolute top-0 w-px -translate-x-1/2 ${
                  stop === 0.5 ? 'h-3 bg-timer-modal-secondary' : 'h-2 bg-timer-btn-hover'
                }`}
              />
            ))}
          </div>
          <div aria-hidden="true" className="mt-1 flex justify-between text-xs text-timer-modal-secondary">
            <span>음악</span>
            <span>환경음</span>
          </div>
        </section>
      </div>
    </BottomSheet>
  )
}
