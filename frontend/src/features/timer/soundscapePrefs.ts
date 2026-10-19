import { storageKeys } from '../../lib/storageKeys'
import { DEFAULT_BALANCE, DEFAULT_PRESET_ID, findPreset, snapBalance } from './soundCatalog'

// 음악 테마와 환경음은 저장하지 않는다. presetId(분위기)에서 파생한다
export type SoundPrefs = {
  presetId: string
  balance: number
  masterVolume: number
}

export const DEFAULT_MASTER_VOLUME = 0.35

export function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

function isVolume(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
}

export function defaultPrefs(): SoundPrefs {
  return {
    presetId: DEFAULT_PRESET_ID,
    balance: DEFAULT_BALANCE,
    masterVolume: DEFAULT_MASTER_VOLUME,
  }
}

// 없어진 분위기의 이전 대상. 밸런스를 끝으로 옮겨 예전처럼 음악만(0) 또는 환경음만(1) 들리게 한다
const RETIRED_PRESETS: Record<string, { presetId: string; balance: number }> = {
  'lofi-only': { presetId: 'forest-lofi', balance: 0 },
  'piano-only': { presetId: 'fireside-piano', balance: 0 },
  'jazz-only': { presetId: 'rainy-cafe', balance: 0 },
  'white-noise-focus': { presetId: 'rainy-cafe', balance: 1 },
  'rain-only': { presetId: 'rainy-cafe', balance: 1 },
}

// 필드별로 검증해 잘못된 값만 기본값으로 바꾼다.
// 예전 prefs(themeId, ambients, musicVolume, presetId null인 직접 조합)는 기본 분위기로 옮겨지고, breakMode는 버린다
export function parsePrefs(raw: string): SoundPrefs {
  const defaults = defaultPrefs()
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return defaults
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return defaults
  const d = data as Record<string, unknown>

  const retired = typeof d.presetId === 'string' ? RETIRED_PRESETS[d.presetId] : undefined
  const storedId = typeof d.presetId === 'string' && findPreset(d.presetId) ? d.presetId : defaults.presetId
  const storedBalance = isVolume(d.balance) ? snapBalance(d.balance) : defaults.balance

  return {
    presetId: retired?.presetId ?? storedId,
    balance: retired?.balance ?? storedBalance,
    masterVolume: isVolume(d.masterVolume) ? d.masterVolume : defaults.masterVolume,
  }
}

export function writePrefs(prefs: SoundPrefs): boolean {
  try {
    localStorage.setItem(storageKeys.soundPrefs, JSON.stringify(prefs))
    return true
  } catch {
    // 저장 실패는 무시한다
    return false
  }
}

function removeKeys(keys: readonly string[]) {
  keys.forEach((key) => {
    try {
      localStorage.removeItem(key)
    } catch {
      // 무시
    }
  })
}

// 저장된 prefs가 없으면 레거시 음악 볼륨을 마스터 볼륨으로 옮기고 바로 저장한다
export function readPrefs(): SoundPrefs {
  let raw: string | null
  let legacyVolume: string | null
  try {
    raw = localStorage.getItem(storageKeys.soundPrefs)
    legacyVolume = localStorage.getItem(storageKeys.musicVolume)
  } catch {
    return defaultPrefs()
  }
  removeKeys(storageKeys.legacyMusicKeys)
  if (raw !== null) {
    if (legacyVolume !== null) removeKeys([storageKeys.musicVolume])
    return parsePrefs(raw)
  }
  const prefs = defaultPrefs()
  if (legacyVolume === null) return prefs
  const volume = Number(legacyVolume)
  if (legacyVolume.trim() !== '' && isVolume(volume)) {
    prefs.masterVolume = volume
    // 옮겨 저장하지 못했으면 다음 로드에서 다시 시도하도록 레거시 키를 남긴다
    if (!writePrefs(prefs)) return prefs
  }
  removeKeys([storageKeys.musicVolume])
  return prefs
}
