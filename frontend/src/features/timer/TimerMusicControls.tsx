import { BottomSheet, BottomSheetItem } from '../../ui/BottomSheet'
import { CheckIcon, SpeakerWaveIcon, SpeakerXMarkIcon } from '../../ui/Icons'
import { MUSIC_TRACKS } from './musicTracks'

type TimerMusicControlsProps = {
  musicEnabled: boolean
  musicTrackIndex: number
  musicVolume: number
  showMusicSheet: boolean
  onToggleEnabled: () => void
  onOpenMusicSheet: () => void
  onCloseMusicSheet: () => void
  onSelectTrack: (index: number) => void
  onChangeVolume: (volume: number) => void
}

export function TimerMusicControls({
  musicEnabled,
  musicTrackIndex,
  musicVolume,
  showMusicSheet,
  onToggleEnabled,
  onOpenMusicSheet,
  onCloseMusicSheet,
  onSelectTrack,
  onChangeVolume,
}: TimerMusicControlsProps) {
  return (
    <>
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
        <button
          type="button"
          onClick={onOpenMusicSheet}
          aria-label={`트랙 선택: ${MUSIC_TRACKS[musicTrackIndex].displayName}`}
          className="min-w-0 max-w-[5.5rem] truncate text-left text-xs text-white/50 transition-colors hover:text-white/80"
        >
          {MUSIC_TRACKS[musicTrackIndex].displayName}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={musicVolume}
          onChange={(event) => onChangeVolume(Number(event.target.value))}
          aria-label="배경 음악 볼륨"
          disabled={!musicEnabled}
          className="h-0.5 w-20 cursor-pointer appearance-none rounded-full bg-white/20 accent-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
        />
      </div>

      <BottomSheet isOpen={showMusicSheet} onClose={onCloseMusicSheet} title="배경음악">
        {MUSIC_TRACKS.map((track, index) => (
          <BottomSheetItem
            key={track.id}
            label={track.displayName}
            rightIcon={musicTrackIndex === index ? <CheckIcon className="h-4 w-4 text-emerald-500" /> : undefined}
            onClick={() => {
              onSelectTrack(index)
              onCloseMusicSheet()
            }}
          />
        ))}
      </BottomSheet>
    </>
  )
}
