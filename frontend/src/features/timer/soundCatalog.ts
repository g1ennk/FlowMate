// 음원 교체 시 파일명을 바꾼다 (/sounds는 1년 immutable 캐시)
import rawCredits from './soundCredits.json'

export type MusicThemeId = 'lofi' | 'jazz' | 'piano'
export type AmbientId = 'rain' | 'cafe' | 'fireplace' | 'forest'
export type SoundTrack = { id: string; title: string; src: string }
export type MusicTheme = { id: MusicThemeId; label: string; tracks: SoundTrack[] }
export type AmbientSound = { id: AmbientId; label: string; src: string }
export type ActiveAmbient = { id: AmbientId; volume: number }
export type SoundPreset = {
  id: string
  label: string
  themeId: MusicThemeId
  ambients: ActiveAmbient[]
}
export type SoundCredit = {
  file: string
  title: string
  author: string
  sourceUrl: string
  license: 'CC0' | 'generated'
}

// 출처와 라이선스는 soundCredits.json에 파일별로 기록한다
export const MUSIC_THEMES: MusicTheme[] = [
  {
    id: 'lofi',
    label: '로파이',
    tracks: [
      { id: 'lofi-snow-drift', title: 'Snow Drift', src: '/sounds/music/lofi/lofi-snow-drift.mp3' },
      { id: 'lofi-keeping-cool', title: 'Keeping Cool', src: '/sounds/music/lofi/lofi-keeping-cool.mp3' },
      { id: 'lofi-windows-down', title: 'Windows Down', src: '/sounds/music/lofi/lofi-windows-down.mp3' },
      { id: 'lofi-first-snow', title: 'First Snow', src: '/sounds/music/lofi/lofi-first-snow.mp3' },
      {
        id: 'lofi-everything-you-ever-dreamed',
        title: 'Everything You Ever Dreamed',
        src: '/sounds/music/lofi/lofi-everything-you-ever-dreamed.mp3',
      },
      { id: 'lofi-2-hour-delay', title: '2 Hour Delay', src: '/sounds/music/lofi/lofi-2-hour-delay.mp3' },
    ],
  },
  {
    id: 'jazz',
    label: '재즈',
    tracks: [
      { id: 'jazz-mellow-cafe-vibe', title: 'Mellow Cafe Vibe', src: '/sounds/music/jazz/jazz-mellow-cafe-vibe.mp3' },
      { id: 'jazz-nova-serenade', title: 'Nova Serenade', src: '/sounds/music/jazz/jazz-nova-serenade.mp3' },
      { id: 'jazz-picnic-on-the-seine', title: 'Picnic On The Seine', src: '/sounds/music/jazz/jazz-picnic-on-the-seine.mp3' },
      {
        id: 'jazz-another-grappa-monsieur',
        title: 'Another Grappa, Monsieur',
        src: '/sounds/music/jazz/jazz-another-grappa-monsieur.mp3',
      },
      { id: 'jazz-gypsy-doo-wop', title: 'Gypsy Doo Wop', src: '/sounds/music/jazz/jazz-gypsy-doo-wop.mp3' },
      { id: 'jazz-slower', title: 'Jazz Slower', src: '/sounds/music/jazz/jazz-slower.mp3' },
    ],
  },
  {
    id: 'piano',
    label: '피아노',
    tracks: [
      { id: 'piano-catmint', title: 'Catmint', src: '/sounds/music/piano/piano-catmint.mp3' },
      { id: 'piano-forget-me-not', title: 'Forget Me Not', src: '/sounds/music/piano/piano-forget-me-not.mp3' },
      { id: 'piano-bluebonnet', title: 'Bluebonnet', src: '/sounds/music/piano/piano-bluebonnet.mp3' },
      { id: 'piano-daisy', title: 'Daisy', src: '/sounds/music/piano/piano-daisy.mp3' },
      { id: 'piano-breathe-in', title: 'Breathe In', src: '/sounds/music/piano/piano-breathe-in.mp3' },
      { id: 'piano-mystical-piano', title: 'Mystical Piano', src: '/sounds/music/piano/piano-mystical-piano.mp3' },
    ],
  },
]

export const AMBIENT_SOUNDS: AmbientSound[] = [
  { id: 'rain', label: '빗소리', src: '/sounds/ambient/rain.mp3' },
  { id: 'cafe', label: '카페', src: '/sounds/ambient/cafe.mp3' },
  { id: 'fireplace', label: '장작불', src: '/sounds/ambient/fireplace.mp3' },
  { id: 'forest', label: '숲', src: '/sounds/ambient/forest.mp3' },
]

// 사용자는 분위기 하나만 고른다. 음악 테마와 환경음은 여기서 파생된다.
// 음악만 듣고 싶으면 밸런스 슬라이더를 음악 쪽 끝으로 민다
export const SOUND_PRESETS: SoundPreset[] = [
  {
    id: 'rainy-cafe',
    label: '비 오는 카페',
    themeId: 'jazz',
    ambients: [{ id: 'rain', volume: 0.5 }, { id: 'cafe', volume: 0.4 }],
  },
  { id: 'fireside-piano', label: '장작불 피아노', themeId: 'piano', ambients: [{ id: 'fireplace', volume: 0.5 }] },
  { id: 'forest-lofi', label: '숲속 로파이', themeId: 'lofi', ambients: [{ id: 'forest', volume: 0.4 }] },
]

export const SOUND_CREDITS: SoundCredit[] = rawCredits as SoundCredit[]
export const DEFAULT_PRESET_ID = 'rainy-cafe'
export const DEFAULT_BALANCE = 0.5

export const BALANCE_STEP = 0.25
export const BALANCE_LABELS: Record<number, string> = {
  0: '음악만',
  0.25: '음악 위주',
  0.5: '균형',
  0.75: '환경음 위주',
  1: '환경음만',
}

// 0~1로 자르고 가장 가까운 0.25 단위로 맞춘다. 정확히 중간이면 올린다
export function snapBalance(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_BALANCE
  const clamped = Math.max(0, Math.min(1, value))
  return Math.min(1, Math.round(clamped / BALANCE_STEP) * BALANCE_STEP)
}

// 0.5에서 둘 다 프리셋 크기 그대로, 0으로 갈수록 환경음이, 1로 갈수록 음악이 줄어든다
export function balanceFactors(balance: number): { music: number; ambient: number } {
  const b = Number.isFinite(balance) ? Math.max(0, Math.min(1, balance)) : DEFAULT_BALANCE
  return {
    music: b <= 0.5 ? 1 : (1 - b) * 2,
    ambient: b >= 0.5 ? 1 : b * 2,
  }
}

export function findTheme(id: string): MusicTheme | undefined {
  return MUSIC_THEMES.find((t) => t.id === id)
}

export function findAmbient(id: string): AmbientSound | undefined {
  return AMBIENT_SOUNDS.find((a) => a.id === id)
}

export function findPreset(id: string): SoundPreset | undefined {
  return SOUND_PRESETS.find((p) => p.id === id)
}

export function pickNextTrack(
  tracks: SoundTrack[],
  previousId: string | null,
  random: () => number = Math.random,
): SoundTrack | null {
  if (tracks.length === 0) return null
  if (tracks.length === 1) return tracks[0]
  const candidates = tracks.filter((t) => t.id !== previousId)
  return candidates[Math.floor(random() * candidates.length)]
}
