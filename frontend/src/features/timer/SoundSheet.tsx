import { BottomSheet } from '../../ui/BottomSheet'
import {
  BALANCE_LABELS,
  DEFAULT_PRESET_ID,
  SOUND_PRESETS,
  findPreset,
  type SoundPreset,
} from './soundCatalog'
import type { ChannelKey } from './soundEngine'
import { useSoundscapeStore } from './soundscapeStore'

type SoundSheetProps = {
  isOpen: boolean
  onClose: () => void
}

// 트랙은 2px로 얇게 그리고, 입력 상자는 24px로 둬서 터치 영역을 확보한다
// 엄지를 직접 그려 브라우저마다 크기가 같게 한다. 엄지 size-4(16px)와 슬라이더 아래 세로 눈금선 줄의 좌우 여백
// THUMB_INSET_CLASS(mx-2, 8px)는 한 쌍이다: 엄지 중심이 양끝에서 8px 안쪽에 있으므로 눈금선도 그만큼 들인다
export const SLIDER_THUMB_CLASS =
  '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:shadow-sm ' +
  '[&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-accent [&::-moz-range-thumb]:shadow-sm'
const THUMB_INSET_CLASS = 'mx-2'

const SLIDER_CLASS =
  'block h-6 w-full cursor-pointer appearance-none bg-linear-to-r from-border-default to-border-default bg-size-[100%_2px] bg-center bg-no-repeat accent-accent ' +
  SLIDER_THUMB_CLASS

const BALANCE_STOPS = [0, 0.25, 0.5, 0.75, 1]

function SectionTitle({ children }: { children: string }) {
  return <h3 className="px-1 pb-2 text-xs font-semibold text-text-tertiary">{children}</h3>
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
      zIndex={10000}
      headerAction={(
        <button
          type="button"
          onClick={resetPrefs}
          aria-label="사운드 설정 초기화"
          className="whitespace-nowrap rounded-lg px-2 py-1 text-sm text-text-secondary transition-colors hover:bg-hover"
        >
          초기화
        </button>
      )}
    >
      <div className="flex flex-col gap-6 px-2 pb-4">
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
                  className={`flex min-h-12 items-center justify-center rounded-xl border px-2 py-2 text-center text-sm font-semibold break-keep transition-colors ${
                    active
                      ? 'border-accent bg-accent/10 text-accent-text'
                      : 'border-border-default text-text-primary hover:bg-hover'
                  }`}
                >
                  {preset.label}
                </button>
              )
            })}
          </div>
          {someFailed && (
            <p className="mt-2 px-1 text-xs text-text-tertiary">일부 소리를 불러오지 못했어요</p>
          )}
          <div className="mt-4 px-1">
            <input
              type="range"
              min={0}
              max={1}
              step={0.25}
              value={balance}
              onChange={(e) => setBalance(Number(e.target.value))}
              aria-label="음악과 환경음 비율"
              aria-valuetext={BALANCE_LABELS[balance]}
              className={SLIDER_CLASS}
            />
            <div aria-hidden="true" className={`relative ${THUMB_INSET_CLASS} h-3`}>
              {BALANCE_STOPS.map((stop) => (
                <span
                  key={stop}
                  data-testid="balance-tick"
                  style={{ left: `${stop * 100}%` }}
                  className={`absolute top-0 w-px -translate-x-1/2 ${
                    stop === 0.5 ? 'h-3 bg-text-secondary' : 'h-2 bg-border-strong'
                  }`}
                />
              ))}
            </div>
            <div aria-hidden="true" className="mt-1 flex justify-between text-xs text-text-tertiary">
              <span>음악</span>
              <span>환경음</span>
            </div>
          </div>
        </section>
      </div>
    </BottomSheet>
  )
}
