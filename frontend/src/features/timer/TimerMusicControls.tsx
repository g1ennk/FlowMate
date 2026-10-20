import { useId, useState } from 'react'
import { SpeakerWaveIcon, SpeakerXMarkIcon } from '../../ui/Icons'
import { DEFAULT_PRESET_ID, findPreset } from './soundCatalog'
import { RESTING_SOUND_HINT, isSoundResting } from './soundPhase'
import { SoundSheet } from './SoundSheet'
import { useSoundscapeStore } from './soundscapeStore'

// 타이머 화면의 사운드 진입점은 버튼 하나다(분위기 이름, 터치 44). 켜기와 볼륨은 시트 안에서 다룬다(.impeccable.md §8).
export function TimerMusicControls() {
  const [sheetOpen, setSheetOpen] = useState(false)
  // 처음 열기 전에는 시트를 마운트하지 않는다 (닫힌 시트의 DOM이 타이머 화면에 남지 않도록)
  const [sheetMounted, setSheetMounted] = useState(false)
  const enabled = useSoundscapeStore((state) => state.enabled)
  const blocked = useSoundscapeStore((state) => state.blocked)
  const presetId = useSoundscapeStore((state) => state.presetId)
  const retryPlayback = useSoundscapeStore((state) => state.retryPlayback)
  const phase = useSoundscapeStore((state) => state.phase)
  const hintId = useId()

  const mood = findPreset(presetId) ?? findPreset(DEFAULT_PRESET_ID)!
  const label = mood.label

  // 자동 재생이 막히면 이 버튼 한 번이 재생 제스처가 된다
  const needsTap = enabled && blocked
  // 다시 시도해도 막혀 있으면 다음 탭은 시트를 연다 (사용자가 언제든 시트에서 소리를 끌 수 있도록)
  const [retried, setRetried] = useState(false)
  const [prevNeedsTap, setPrevNeedsTap] = useState(needsTap)
  if (needsTap !== prevNeedsTap) {
    setPrevNeedsTap(needsTap)
    setRetried(false)
  }
  const canRetry = needsTap && !retried
  // 휴식과 대기 중에는 켜 둬도 조용하다. 버튼은 그대로 눌러 다음 집중의 소리를 미리 고를 수 있다
  const resting = isSoundResting(enabled, phase)

  function handleTap() {
    if (canRetry) {
      setRetried(true)
      retryPlayback()
      return
    }
    setSheetMounted(true)
    setSheetOpen(true)
  }

  return (
    <div className="relative mt-4 flex max-w-full flex-col items-center">
      <button
        type="button"
        onClick={handleTap}
        aria-label={canRetry ? '눌러서 재생' : `사운드 선택: ${label}, ${enabled ? '켜짐' : '꺼짐'}`}
        aria-describedby={resting ? hintId : undefined}
        className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-control px-3 text-sm text-timer-modal-secondary transition-colors hover:bg-timer-btn hover:text-timer-btn-text outline-timer-focus-ring"
      >
        {enabled ? <SpeakerWaveIcon /> : <SpeakerXMarkIcon />}
        <span className="min-w-0 truncate">{label}</span>
        {canRetry && <span className="shrink-0 text-timer-btn-text">눌러서 재생</span>}
      </button>
      {/* 버튼 아래에 띄워 두어 집중과 휴식을 오갈 때 화면 위 숫자와 버튼이 움직이지 않게 한다 */}
      {resting && (
        <p id={hintId} className="absolute top-full whitespace-nowrap text-xs text-timer-modal-secondary">
          {RESTING_SOUND_HINT}
        </p>
      )}
      {sheetMounted && <SoundSheet isOpen={sheetOpen} onClose={() => setSheetOpen(false)} />}
    </div>
  )
}
