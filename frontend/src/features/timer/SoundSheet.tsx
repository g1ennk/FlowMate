import { useId, type InputHTMLAttributes } from 'react'
import { BottomSheet } from '../../ui/BottomSheet'
import { Button } from '../../ui/Button'
import { SectionHeader } from '../../ui/SectionHeader'
import { Switch } from '../../ui/Switch'
import {
  BALANCE_LABELS,
  DEFAULT_PRESET_ID,
  SOUND_PRESETS,
  findPreset,
  type SoundPreset,
} from './soundCatalog'
import type { ChannelKey } from './soundEngine'
import { useSoundscapeStore } from './soundscapeStore'
import { RESTING_SOUND_HINT, isSoundResting } from './soundPhase'

// 타이머 위에서 여는 사운드 시트. 늘 어두운 timer 면이고 timer-* 토큰만 쓴다(.impeccable.md §4-3).
// 켜기/끄기, 전체 볼륨, 분위기, 음악과 환경음 비율을 모두 여기서 다룬다(타이머 화면에는 버튼 하나만 둔다).

type SoundSheetProps = {
  isOpen: boolean
  onClose: () => void
}

// 엄지를 직접 그려 브라우저마다 크기가 같게 한다. 엄지 size-4(16px)의 중심은 양끝에서 8px 안쪽이라
// 트랙 선과 눈금선 줄도 THUMB_INSET_CLASS(mx-2, 8px)만큼 들인다
const SLIDER_THUMB_CLASS =
  '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-timer-accent ' +
  '[&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-timer-accent [&::-moz-range-track]:bg-transparent'
const THUMB_INSET_CLASS = 'mx-2'

// 트랙은 2px 선(장식 그라디언트 없이 테두리 하나), 입력 상자는 44px로 둬서 터치 영역을 확보한다(§6-2)
function SoundSlider(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={`relative ${props.disabled ? 'opacity-40' : ''}`}>
      <span aria-hidden="true" className="absolute inset-x-2 top-1/2 -translate-y-1/2 border-t-2 border-timer-btn-hover" />
      <input
        type="range"
        {...props}
        className={`relative block h-11 w-full cursor-pointer appearance-none bg-transparent outline-timer-focus-ring disabled:cursor-not-allowed ${SLIDER_THUMB_CLASS}`}
      />
    </div>
  )
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
  const masterVolume = useSoundscapeStore((s) => s.masterVolume)
  const setEnabled = useSoundscapeStore((s) => s.setEnabled)
  const setMasterVolume = useSoundscapeStore((s) => s.setMasterVolume)
  const applyPreset = useSoundscapeStore((s) => s.applyPreset)
  const setBalance = useSoundscapeStore((s) => s.setBalance)
  const resetPrefs = useSoundscapeStore((s) => s.resetPrefs)
  const blocked = useSoundscapeStore((s) => s.blocked)
  const retryPlayback = useSoundscapeStore((s) => s.retryPlayback)
  const phase = useSoundscapeStore((s) => s.phase)
  const restingHintId = useId()
  const resting = isSoundResting(enabled, phase)

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
          <Switch
            tone="timer"
            label="사운드"
            checked={enabled}
            onChange={setEnabled}
            describedBy={resting ? restingHintId : undefined}
          />
          {/* 휴식 중에 켜도 조용한 이유. 타이머 화면 버튼 아래 안내와 같은 문구이고, 스위치 설명으로도 읽힌다 */}
          {resting && (
            <p id={restingHintId} className="break-keep text-xs text-timer-modal-secondary">{RESTING_SOUND_HINT}</p>
          )}
          {/* 자동 재생이 막혔을 때 타이머 화면 버튼과 같은 재시도를 시트에서도 준다(누르는 것 자체가 재생 제스처) */}
          {enabled && blocked && (
            <div className="flex items-center justify-between gap-card-item">
              <p className="min-w-0 break-keep text-xs text-timer-modal-secondary">브라우저가 소리를 막았어요</p>
              <Button variant="ghost" size="sm" tone="timer" className="-mr-3 shrink-0" onClick={retryPlayback}>
                눌러서 재생
              </Button>
            </div>
          )}
          <div className="mt-4">
            <SectionTitle>볼륨</SectionTitle>
            <SoundSlider
              min={0}
              max={1}
              step={0.05}
              value={masterVolume}
              onChange={(e) => setMasterVolume(Number(e.target.value))}
              aria-label="전체 볼륨"
              disabled={!enabled}
            />
          </div>
        </section>

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
