import { create } from 'zustand'
import { DEFAULT_MUSIC_TRACK_INDEX, MUSIC_TRACKS } from './musicTracks'
import { storageKeys } from '../../lib/storageKeys'

const STORAGE_KEY_VOLUME = storageKeys.musicVolume
const LEGACY_STORAGE_KEYS = storageKeys.legacyMusicKeys
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
  playTrack: (index: number) => void
  playNextTrack: () => void
  playIfAllowed: () => void
  pauseForFlowExit: () => void
  stopSession: () => void
  setVolume: (value: number) => void
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
  clearLegacyMusicStorage()
  return {
    enabled: false,
    currentTrackIndex: DEFAULT_MUSIC_TRACK_INDEX,
    isPlaying: false,
    volume: readStoredVolume(),
  }
}

let audioElement: HTMLAudioElement | null = null

function getAudio() {
  if (!audioElement) {
    audioElement = new Audio()
    audioElement.loop = false
    audioElement.volume = readStoredVolume()
    audioElement.addEventListener('ended', handleAudioEnded)
  }
  return audioElement
}

function getExistingAudio() {
  return audioElement
}

function normalizeTrackIndex(index: number) {
  const trackCount = MUSIC_TRACKS.length
  if (trackCount === 0) return DEFAULT_MUSIC_TRACK_INDEX
  return ((index % trackCount) + trackCount) % trackCount
}

function syncAudioTrack(audio: HTMLAudioElement, trackIndex: number) {
  const track = MUSIC_TRACKS[normalizeTrackIndex(trackIndex)]
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

function handleAudioEnded() {
  useMusicStore.getState().playNextTrack()
}

export const useMusicStore = create<MusicStore>((set, get) => ({
  ...createInitialSessionState(),

  playTrack: (index: number) => {
    const safeIndex = normalizeTrackIndex(index)
    const { enabled, volume } = get()
    set({ currentTrackIndex: safeIndex })

    if (!enabled) {
      set({ isPlaying: false })
      return
    }

    const audio = getAudio()
    syncAudioTrack(audio, safeIndex)
    audio.volume = volume

    audio.play()
      .then(() => set({ isPlaying: true }))
      .catch(() => set({ isPlaying: false }))
  },

  playNextTrack: () => {
    const { enabled, currentTrackIndex } = get()
    if (!enabled) {
      set({ isPlaying: false })
      return
    }

    get().playTrack(currentTrackIndex + 1)
  },

  playIfAllowed: () => {
    const { enabled, currentTrackIndex } = get()
    if (!enabled) return

    get().playTrack(currentTrackIndex)
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
