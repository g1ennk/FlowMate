import { create } from 'zustand'
import {
  DEFAULT_PRESET_ID,
  SOUND_PRESETS,
  balanceFactors,
  findAmbient,
  findPreset,
  findTheme,
  pickNextTrack,
  snapBalance,
  type MusicThemeId,
  type SoundPreset,
} from './soundCatalog'
import {
  FADE_PAUSE_MS,
  FADE_PHASE_END_MS,
  getSoundEngine,
  type ChannelKey,
  type PlayResult,
  type SoundEngine,
} from './soundEngine'
import type { SoundPhase } from './soundPhase'
import {
  clampVolume,
  defaultPrefs,
  readPrefs,
  writePrefs,
  type SoundPrefs,
} from './soundscapePrefs'

export { DEFAULT_MASTER_VOLUME, type SoundPrefs } from './soundscapePrefs'

export type SoundscapeState = SoundPrefs & {
  enabled: boolean
  phase: SoundPhase
  currentTrackId: string | null
  failed: ChannelKey[]
  blocked: boolean
}

export type SoundscapeActions = {
  setEnabled(enabled: boolean): void
  setPhase(phase: SoundPhase): void
  retryPlayback(): void
  applyPreset(presetId: string): void
  setBalance(balance: number): void
  setMasterVolume(volume: number): void
  resetPrefs(): void
  stopSession(): void
}

type SoundscapeStore = SoundscapeState & SoundscapeActions
type ChannelPlan = { src: string; volume: number; loop: boolean }

const PREF_KEYS: (keyof SoundPrefs)[] = ['presetId', 'balance', 'masterVolume']
const noop = () => {}

// 소리 실패는 타이머에 영향을 주지 않는다: 엔진 호출은 모두 여기를 거친다
function withEngine(fn: (engine: SoundEngine) => void) {
  try {
    fn(getSoundEngine())
  } catch {
    // 무시
  }
}

function prefsOf(state: SoundPrefs): SoundPrefs {
  const { presetId, balance, masterVolume } = state
  return { presetId, balance, masterVolume }
}

// 테마와 환경음은 고른 분위기에서 파생한다
function moodOf(presetId: string): SoundPreset {
  return findPreset(presetId) ?? findPreset(DEFAULT_PRESET_ID) ?? SOUND_PRESETS[0]
}

function resolveTrackId(themeId: MusicThemeId, currentTrackId: string | null): string | null {
  const tracks = findTheme(themeId)?.tracks ?? []
  if (tracks.some((t) => t.id === currentTrackId)) return currentTrackId
  return pickNextTrack(tracks, currentTrackId)?.id ?? null
}

// 지금 들려야 하는 채널과 그 소스, 볼륨. 집중 중에만 들리고 휴식, 대기, 정지 중에는 모두 조용하다.
// 밸런스 양 끝(음악만, 환경음만)은 한쪽을 아예 끄겠다는 선택이라 볼륨 0인 채널을 빼서 내려받지도 재생하지도 않는다.
// 안쪽 단계에서는 볼륨이 0이 된 채널도 남긴다
function audibleChannels(state: SoundscapeState): Map<ChannelKey, ChannelPlan> {
  const plans = new Map<ChannelKey, ChannelPlan>()
  if (!state.enabled || state.phase !== 'focus') return plans
  const mood = moodOf(state.presetId)
  const factors = balanceFactors(state.balance)
  const atEndpoint = state.balance === 0 || state.balance === 1
  const add = (channel: ChannelKey, plan: ChannelPlan) => {
    if (atEndpoint && plan.volume === 0) return
    plans.set(channel, plan)
  }
  const track = findTheme(mood.themeId)?.tracks.find((t) => t.id === state.currentTrackId)
  if (track) add('music', { src: track.src, volume: factors.music, loop: false })
  mood.ambients.forEach((a) => {
    const sound = findAmbient(a.id)
    if (sound) add(`ambient:${a.id}`, { src: sound.src, volume: a.volume * factors.ambient, loop: true })
  })
  return plans
}

function fadeMsFor(prevPhase: SoundPhase, nextPhase: SoundPhase): number {
  const focusEnded = prevPhase === 'focus' && (nextPhase === 'break' || nextPhase === 'waiting')
  return focusEnded ? FADE_PHASE_END_MS : FADE_PAUSE_MS
}

// 한 번이라도 재생한 채널. 이벤트 구독과 stopSession 대상
const knownChannels = new Set<ChannelKey>()
// 자동 재생 정책에 막힌 채널. 하나라도 남아 있으면 blocked
const blockedChannels = new Set<ChannelKey>()
// 이번 세션에서 재생 중 오류가 난 곡. 곡마다 한 번만 시도하고, 분위기를 바꾸거나 세션을 끝내면 비운다
const failedTrackIds = new Set<string>()

function setChannelBlocked(channel: ChannelKey, isBlocked: boolean) {
  if (isBlocked) blockedChannels.add(channel)
  else blockedChannels.delete(channel)
  const blocked = blockedChannels.size > 0
  if (useSoundscapeStore.getState().blocked !== blocked) useSoundscapeStore.setState({ blocked })
}

function markFailed(channel: ChannelKey) {
  const state = useSoundscapeStore.getState()
  if (!state.enabled || state.failed.includes(channel)) return
  useSoundscapeStore.setState({ failed: [...state.failed, channel] })
}

function handlePlayResult(channel: ChannelKey, result: PlayResult) {
  const state = useSoundscapeStore.getState()
  if (!state.enabled) return
  if (result === 'ok') {
    if (state.failed.includes(channel)) {
      useSoundscapeStore.setState({ failed: state.failed.filter((k) => k !== channel) })
    }
    setChannelBlocked(channel, false)
  } else if (result === 'blocked') {
    // 결과가 늦게 와서 이미 꺼진 채널이면 다시 시도할 대상이 아니다
    if (audibleChannels(state).has(channel)) setChannelBlocked(channel, true)
  } else if (result === 'error') {
    markFailed(channel)
  }
  // 'aborted'는 새 요청에 밀린 것이므로 무시한다
}

// 곡이 끝나거나 오류가 나면 다른 곡으로 넘어간다 (사용자 버튼은 없다). 오류가 난 곡은 건너뛴다
function advanceTrack() {
  const state = useSoundscapeStore.getState()
  const tracks = (findTheme(moodOf(state.presetId).themeId)?.tracks ?? []).filter((t) => !failedTrackIds.has(t.id))
  const track = pickNextTrack(tracks, state.currentTrackId)
  if (!track) return
  useSoundscapeStore.setState({ currentTrackId: track.id })
  // 곡이 하나뿐이어도 다시 처음부터 재생되도록 diff 대신 직접 재생한다
  const plan = audibleChannels(useSoundscapeStore.getState()).get('music')
  if (plan) playChannel('music', plan)
}

// 음악 곡 하나가 실패해도 테마의 다른 곡으로 이어 간다. 모든 곡이 실패하면 멈추고 failed로 남긴다
function handleMusicError() {
  const state = useSoundscapeStore.getState()
  if (!state.enabled) return
  markFailed('music')
  if (state.currentTrackId) failedTrackIds.add(state.currentTrackId)
  advanceTrack()
}

function playChannel(channel: ChannelKey, plan: ChannelPlan) {
  withEngine((engine) => {
    if (!knownChannels.has(channel)) {
      knownChannels.add(channel)
      if (channel === 'music') engine.onEnded('music', () => advanceTrack())
      engine.onError(channel, () => (channel === 'music' ? handleMusicError() : markFailed(channel)))
    }
    const pending = plan.loop
      ? engine.play(channel, plan.src, plan.volume, { loop: true })
      : engine.play(channel, plan.src, plan.volume)
    void Promise.resolve(pending).then((result) => handlePlayResult(channel, result), noop)
  })
}

// 모든 재생 변화는 이전/다음 상태의 차이로 처리한다
function syncPlayback(prev: SoundscapeState, next: SoundscapeState, fadeMs: number) {
  const before = audibleChannels(prev)
  const after = audibleChannels(next)
  before.forEach((_, channel) => {
    if (after.has(channel)) return
    if (blockedChannels.has(channel)) setChannelBlocked(channel, false)
    withEngine((engine) => void Promise.resolve(engine.fadeOutAndPause(channel, fadeMs)).catch(noop))
  })
  after.forEach((plan, channel) => {
    const old = before.get(channel)
    if (!old || old.src !== plan.src) playChannel(channel, plan)
    else if (old.volume !== plan.volume) withEngine((engine) => engine.setVolume(channel, plan.volume))
  })
}

export const useSoundscapeStore = create<SoundscapeStore>()((set, get) => {
  function commit(patch: Partial<SoundscapeState>, fadeMs: number = FADE_PAUSE_MS) {
    const prev = get()
    if (patch.presetId !== undefined && patch.presetId !== prev.presetId) failedTrackIds.clear()
    set(patch)
    const next = get()
    syncPlayback(prev, next, fadeMs)
    if (PREF_KEYS.some((key) => key in patch)) writePrefs(prefsOf(next))
  }

  return {
    ...readPrefs(),
    enabled: false,
    phase: 'stopped',
    currentTrackId: null,
    failed: [],
    blocked: false,

    setEnabled(enabled) {
      if (!enabled) {
        blockedChannels.clear()
        commit({ enabled: false, failed: [], blocked: false })
        return
      }
      // 사용자 탭 안에서 동기로 호출해야 iOS가 오디오를 허용한다
      withEngine((engine) => engine.resume())
      const state = get()
      withEngine((engine) => engine.setMasterVolume(state.masterVolume))
      commit({ enabled: true, currentTrackId: resolveTrackId(moodOf(state.presetId).themeId, state.currentTrackId) })
    },

    setPhase(phase) {
      const prevPhase = get().phase
      if (phase === prevPhase) return
      commit({ phase }, fadeMsFor(prevPhase, phase))
    },

    retryPlayback() {
      withEngine((engine) => engine.resume())
      audibleChannels(get()).forEach((plan, channel) => playChannel(channel, plan))
    },

    applyPreset(presetId) {
      const preset = findPreset(presetId)
      if (!preset) return
      commit({ presetId: preset.id, currentTrackId: resolveTrackId(preset.themeId, get().currentTrackId) })
    },

    setBalance(balance) {
      const snapped = snapBalance(balance)
      if (snapped === get().balance) return
      commit({ balance: snapped })
    },

    setMasterVolume(volume) {
      const clamped = clampVolume(volume)
      withEngine((engine) => engine.setMasterVolume(clamped))
      commit({ masterVolume: clamped })
    },

    resetPrefs() {
      const defaults = defaultPrefs()
      withEngine((engine) => engine.setMasterVolume(defaults.masterVolume))
      commit({ ...defaults, currentTrackId: resolveTrackId(moodOf(defaults.presetId).themeId, get().currentTrackId) })
    },

    stopSession() {
      withEngine((engine) => knownChannels.forEach((channel) => engine.stop(channel)))
      blockedChannels.clear()
      failedTrackIds.clear()
      set({ enabled: false, currentTrackId: null, failed: [], blocked: false })
    },
  }
})
