import { useId, useState } from 'react'
import { Button } from '../../ui/Button'
import { IconButton } from '../../ui/IconButton'
import { ChevronRightIcon, SpeakerWaveIcon, SpeakerXMarkIcon } from '../../ui/Icons'
import { DEFAULT_PRESET_ID, findPreset } from './soundCatalog'
import { RESTING_SOUND_HINT, isSoundResting } from './soundPhase'
import { SoundSheet } from './SoundSheet'
import { SoundSlider } from './SoundSlider'
import { useSoundscapeStore } from './soundscapeStore'

// 타이머 화면의 사운드 줄. 자주 쓰는 켜기/끄기와 볼륨은 여기서 바로 다루고,
// 분위기와 음악/환경음 비율은 분위기 이름을 눌러 여는 시트에서 다룬다(.impeccable.md §8).
export function TimerMusicControls() {
  const [sheetOpen, setSheetOpen] = useState(false)
  // 처음 열기 전에는 시트를 마운트하지 않는다 (닫힌 시트의 DOM이 타이머 화면에 남지 않도록)
  const [sheetMounted, setSheetMounted] = useState(false)
  const enabled = useSoundscapeStore((state) => state.enabled)
  const blocked = useSoundscapeStore((state) => state.blocked)
  const presetId = useSoundscapeStore((state) => state.presetId)
  const masterVolume = useSoundscapeStore((state) => state.masterVolume)
  const phase = useSoundscapeStore((state) => state.phase)
  const setEnabled = useSoundscapeStore((state) => state.setEnabled)
  const setMasterVolume = useSoundscapeStore((state) => state.setMasterVolume)
  const retryPlayback = useSoundscapeStore((state) => state.retryPlayback)
  const hintId = useId()

  const mood = findPreset(presetId) ?? findPreset(DEFAULT_PRESET_ID)!
  // 자동 재생이 막히면 아래 "눌러서 재생" 한 번이 재생 제스처가 된다
  const needsTap = enabled && blocked
  // 휴식과 대기 중에는 켜 둬도 조용하다. 분위기 이름은 그대로 눌러 다음 집중의 소리를 미리 고를 수 있다
  const resting = !needsTap && isSoundResting(enabled, phase)

  function openSheet() {
    setSheetMounted(true)
    setSheetOpen(true)
  }

  return (
    // 폭은 위 타이머 버튼 줄(버튼 56 × 3 + 간격 24 × 2 = 216)에 맞춰 양끝을 가지런히 한다
    <div className="relative mt-4 flex w-full max-w-54 flex-col items-center">
      <div className="flex w-full items-center gap-card-item">
        {/* 탭 안에서 바로 켜야 iOS가 오디오를 허용한다 */}
        <IconButton
          tone="timer"
          label="사운드"
          aria-pressed={enabled}
          aria-describedby={resting ? hintId : undefined}
          onClick={() => setEnabled(!enabled)}
        >
          {enabled ? <SpeakerWaveIcon /> : <SpeakerXMarkIcon />}
        </IconButton>
        <SoundSlider
          wrapperClassName="min-w-0 flex-1"
          min={0}
          max={1}
          step={0.05}
          value={masterVolume}
          onChange={(e) => setMasterVolume(Number(e.target.value))}
          aria-label="전체 볼륨"
          disabled={!enabled}
        />
      </div>
      <button
        type="button"
        onClick={openSheet}
        aria-label={`분위기 선택: ${mood.label}`}
        className="inline-flex min-h-11 max-w-full items-center gap-1 rounded-control pl-3 pr-2 text-sm text-timer-modal-secondary transition-colors hover:bg-timer-btn hover:text-timer-btn-text outline-timer-focus-ring"
      >
        <span className="min-w-0 truncate">{mood.label}</span>
        <ChevronRightIcon className="size-4 shrink-0" />
      </button>
      {/* 줄 아래에 띄워 두어 집중과 휴식을 오갈 때 화면 위 숫자와 버튼이 움직이지 않게 한다 */}
      {needsTap && (
        <div className="absolute top-full">
          <Button variant="ghost" size="sm" tone="timer" onClick={retryPlayback}>
            눌러서 재생
          </Button>
        </div>
      )}
      {resting && (
        <p id={hintId} className="absolute top-full whitespace-nowrap text-xs text-timer-modal-secondary">
          {RESTING_SOUND_HINT}
        </p>
      )}
      {sheetMounted && <SoundSheet isOpen={sheetOpen} onClose={() => setSheetOpen(false)} />}
    </div>
  )
}
