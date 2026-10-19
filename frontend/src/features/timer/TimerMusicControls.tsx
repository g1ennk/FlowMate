import { useState } from 'react'
import { SpeakerWaveIcon, SpeakerXMarkIcon } from '../../ui/Icons'
import { DEFAULT_PRESET_ID, findPreset } from './soundCatalog'
import { SLIDER_THUMB_CLASS, SoundSheet } from './SoundSheet'
import { useSoundscapeStore } from './soundscapeStore'

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
  const retryPlayback = useSoundscapeStore((state) => state.retryPlayback)
  const setMasterVolume = useSoundscapeStore((state) => state.setMasterVolume)

  const mood = findPreset(presetId) ?? findPreset(DEFAULT_PRESET_ID)!
  const label = mood.label

  const needsTap = enabled && blocked
  // 다시 시도해도 막혀 있으면 다음 탭은 끄기로 돌아간다 (사용자가 언제든 소리를 끌 수 있도록)
  const [retried, setRetried] = useState(false)
  const [prevNeedsTap, setPrevNeedsTap] = useState(needsTap)
  if (needsTap !== prevNeedsTap) {
    setPrevNeedsTap(needsTap)
    setRetried(false)
  }
  const canRetry = needsTap && !retried
  // 휴식과 대기 중에는 소리를 켜 둬도 조용하다. 고장으로 오해하지 않도록 흐리게 두고 이유를 보여준다
  // 토글과 분위기는 그대로 눌러서 다음 집중의 소리를 미리 고를 수 있다
  const resting = enabled && (phase === 'break' || phase === 'waiting')
  const dimClass = resting ? 'opacity-60' : ''

  function handleToggle() {
    if (canRetry) {
      setRetried(true)
      retryPlayback()
      return
    }
    setEnabled(!enabled)
  }

  return (
    <div className="mt-10 flex items-center gap-2.5">
      <button
        type="button"
        onClick={handleToggle}
        aria-label={canRetry ? '눌러서 재생' : enabled ? '배경 음악 끄기' : '배경 음악 켜기'}
        className={`-m-2 shrink-0 p-2 text-white/60 transition-colors hover:text-white/90 ${dimClass}`}
      >
        {enabled
          ? <SpeakerWaveIcon className="h-4 w-4" />
          : <SpeakerXMarkIcon className="h-4 w-4" />
        }
      </button>
      <button
        type="button"
        onClick={() => {
          setSheetMounted(true)
          setSheetOpen(true)
        }}
        aria-label={`사운드 선택: ${label}`}
        className={`min-w-0 max-w-[5.5rem] truncate text-left text-xs text-white/50 transition-colors hover:text-white/80 ${dimClass}`}
      >
        {label}
      </button>
      {canRetry && (
        <span aria-hidden="true" className="shrink-0 text-xs text-white/60">
          눌러서 재생
        </span>
      )}
      {resting ? (
        <span className="shrink-0 text-xs text-white/60">집중할 때 다시 재생돼요</span>
      ) : (
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={masterVolume}
          onChange={(event) => setMasterVolume(Number(event.target.value))}
          aria-label="전체 볼륨"
          disabled={!enabled}
          className={`-my-1 h-6 w-20 cursor-pointer appearance-none bg-linear-to-r from-white/20 to-white/20 bg-size-[100%_2px] bg-center bg-no-repeat accent-accent disabled:cursor-not-allowed disabled:opacity-40 ${SLIDER_THUMB_CLASS}`}
        />
      )}
      {sheetMounted && <SoundSheet isOpen={sheetOpen} onClose={() => setSheetOpen(false)} />}
    </div>
  )
}
