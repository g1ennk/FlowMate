export type MusicTrackMeta = {
  id: string
  displayName: string
  src: string
}

export const DEFAULT_MUSIC_TRACK_INDEX = 0

export const MUSIC_TRACKS: MusicTrackMeta[] = [
  {
    id: 'focus-study',
    displayName: 'Focus Study',
    src: '/sounds/focus-study.mp3',
  },
  {
    id: 'cozy-study',
    displayName: 'Cozy Study',
    src: '/sounds/cozy-study.mp3',
  },
  {
    id: 'jazzy-loop',
    displayName: 'Jazzy Loop',
    src: '/sounds/jazzy-loop.mp3',
  },
]
