import { create } from 'zustand'
import { DEFAULT_MUSIC_TRACK_INDEX, MUSIC_TRACKS } from './musicTracks'

const STORAGE_KEY_VOLUME = 'flowmate:music:volume'
const LEGACY_STORAGE_KEYS = ['flowmate:music:trackIndex', 'flowmate:music:enabled']
export const DEFAULT_MUSIC_VOLUME = 0.35

export type PersistedMusicPrefs = {
  volume: number
}

export type MusicSessionState = {
  enabled: boolean
  currentTrackIndex: number
  isPlaying: boolean
  volume: number
}

type MusicActions = {
  playIfAllowed: () => void
  pauseForFlowExit: () => void
  stopSession: () => void
  setVolume: (value: number) => void
  setTrack: (index: number) => void
  setEnabled: (value: boolean) => void
}

type MusicStore = MusicSessionState & MusicActions

function clearLegacyMusicStorage() {
  if (typeof window === 'undefined') return
  try {
    LEGACY_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key))
  } catch {
    // ignore localStorage failures
  }
}

function readStoredVolume(): number {
  try {
    const raw = Number(localStorage.getItem(STORAGE_KEY_VOLUME))
    return Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : DEFAULT_MUSIC_VOLUME
  } catch {
    return DEFAULT_MUSIC_VOLUME
  }
}

function persistVolume(volume: number) {
  try {
    localStorage.setItem(STORAGE_KEY_VOLUME, String(volume))
  } catch {
    // ignore localStorage failures
  }
}

function clampVolume(value: number) {
  return Math.max(0, Math.min(1, value))
}

function createInitialSessionState(): MusicSessionState {
  return {
    enabled: false,
    currentTrackIndex: DEFAULT_MUSIC_TRACK_INDEX,
    isPlaying: false,
    volume: readStoredVolume(),
  }
}

clearLegacyMusicStorage()

let audioElement: HTMLAudioElement | null = null

function getAudio() {
  if (!audioElement) {
    audioElement = new Audio()
    audioElement.loop = false
    audioElement.volume = readStoredVolume()
  }
  return audioElement
}

function getExistingAudio() {
  return audioElement
}

function syncAudioTrack(audio: HTMLAudioElement, trackIndex: number) {
  const track = MUSIC_TRACKS[trackIndex]
  if (audio.dataset.trackId === track.id) return
  audio.src = track.src
  audio.dataset.trackId = track.id
  audio.load()
}

function pauseAudio(audio: HTMLAudioElement) {
  try {
    audio.pause()
  } catch {
    // ignore media pause failures in unsupported environments
  }
}

function resetAudio(audio: HTMLAudioElement) {
  pauseAudio(audio)
  audio.currentTime = 0
  audio.removeAttribute('src')
  delete audio.dataset.trackId
  audio.load()
}

export const useMusicStore = create<MusicStore>((set, get) => ({
  ...createInitialSessionState(),

  playIfAllowed: () => {
    const { enabled, currentTrackIndex } = get()
    if (!enabled) return

    const audio = getAudio()
    syncAudioTrack(audio, currentTrackIndex)
    audio.volume = get().volume

    audio.play()
      .then(() => set({ isPlaying: true }))
      .catch(() => set({ isPlaying: false }))
  },

  pauseForFlowExit: () => {
    const audio = getExistingAudio()
    if (!audio) {
      set({ isPlaying: false })
      return
    }

    pauseAudio(audio)
    set({ isPlaying: false })
  },

  stopSession: () => {
    const audio = getExistingAudio()
    if (audio) {
      resetAudio(audio)
    }

    set({
      enabled: false,
      currentTrackIndex: DEFAULT_MUSIC_TRACK_INDEX,
      isPlaying: false,
    })
  },

  setVolume: (value: number) => {
    const nextVolume = clampVolume(value)
    const audio = getAudio()
    audio.volume = nextVolume
    set({ volume: nextVolume })
    persistVolume(nextVolume)
  },

  setTrack: (index: number) => {
    const safeIndex = Math.max(0, Math.min(MUSIC_TRACKS.length - 1, index))
    const { isPlaying } = get()
    set({ currentTrackIndex: safeIndex })

    if (!isPlaying) return

    const audio = getAudio()
    syncAudioTrack(audio, safeIndex)
    audio.play()
      .then(() => set({ isPlaying: true }))
      .catch(() => set({ isPlaying: false }))
  },

  setEnabled: (value: boolean) => {
    if (!value) {
      const audio = getExistingAudio()
      if (audio) pauseAudio(audio)
      set({ enabled: false, isPlaying: false })
      return
    }

    set({ enabled: true })
  },
}))
