import { SpeakerWaveIcon, SpeakerXMarkIcon } from '../../ui/Icons'
import { MUSIC_LABEL } from './musicTracks'

type TimerMusicControlsProps = {
  musicEnabled: boolean
  musicVolume: number
  onToggleEnabled: () => void
  onChangeVolume: (volume: number) => void
}

export function TimerMusicControls({
  musicEnabled,
  musicVolume,
  onToggleEnabled,
  onChangeVolume,
}: TimerMusicControlsProps) {
  return (
    <div className="mt-10 flex items-center gap-2.5">
      <button
        type="button"
        onClick={onToggleEnabled}
        aria-label={musicEnabled ? '배경 음악 끄기' : '배경 음악 켜기'}
        className="shrink-0 text-white/60 transition-colors hover:text-white/90"
      >
        {musicEnabled
          ? <SpeakerWaveIcon className="h-4 w-4" />
          : <SpeakerXMarkIcon className="h-4 w-4" />
        }
      </button>
      <span className="min-w-0 max-w-[5.5rem] truncate text-left text-xs text-white/50">
        {MUSIC_LABEL}
      </span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={musicVolume}
        onChange={(event) => onChangeVolume(Number(event.target.value))}
        aria-label="배경 음악 볼륨"
        disabled={!musicEnabled}
        className="h-0.5 w-20 cursor-pointer appearance-none rounded-full bg-white/20 accent-accent disabled:cursor-not-allowed disabled:opacity-40"
      />
    </div>
  )
}
