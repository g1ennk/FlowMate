import type { AmbientId } from './soundCatalog'

export type ChannelKey = 'music' | `ambient:${AmbientId}`
export type PlayResult = 'ok' | 'blocked' | 'aborted' | 'error'

export const FADE_PHASE_END_MS = 3000
export const FADE_PAUSE_MS = 500
// 멈춘 컨텍스트가 다시 돌아오기를 기다리는 시간. 넘기면 'blocked'로 보고한다
export const RESUME_WAIT_MS = 300

export interface SoundEngine {
  resume(): void
  setMasterVolume(volume: number): void
  play(channel: ChannelKey, src: string, volume: number, options?: { loop?: boolean }): Promise<PlayResult>
  setVolume(channel: ChannelKey, volume: number): void
  fadeOutAndPause(channel: ChannelKey, fadeMs: number): Promise<void>
  stop(channel: ChannelKey): void
  onEnded(channel: ChannelKey, listener: () => void): () => void
  onError(channel: ChannelKey, listener: () => void): () => void
}

type Channel = {
  audio: HTMLAudioElement
  gain: GainNode
  fadeToken: number
  fadeTimer: ReturnType<typeof setTimeout> | null
  fadeResolve: (() => void) | null
}

type ListenerEvent = 'ended' | 'error'

const noop = () => {}

// await 전후로 state가 바뀌므로 좁혀진 타입을 쓰지 않도록 함수로 읽는다
function isRunning(context: AudioContext): boolean {
  return context.state === 'running'
}

// 실패와 타임아웃을 모두 정상 종료로 본다. 결과는 호출한 쪽이 ctx.state로 다시 확인한다
async function settleWithin(promise: Promise<void>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | null = null
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ms)
  })
  try {
    await Promise.race([promise.catch(noop), timeout])
  } finally {
    if (timer !== null) clearTimeout(timer)
  }
}

export function createSoundEngine(): SoundEngine {
  let ctx: AudioContext | null = null
  let master: GainNode | null = null
  let masterVolume = 1
  const channels = new Map<ChannelKey, Channel>()
  const listeners = new Map<ChannelKey, Record<ListenerEvent, Set<() => void>>>()

  function listenerSets(key: ChannelKey) {
    let sets = listeners.get(key)
    if (!sets) {
      sets = { ended: new Set(), error: new Set() }
      listeners.set(key, sets)
    }
    return sets
  }

  function getContext(): AudioContext {
    if (!ctx) {
      const created = new AudioContext()
      const gain = created.createGain()
      gain.gain.value = masterVolume
      gain.connect(created.destination)
      ctx = created
      master = gain
    }
    return ctx
  }

  function getChannel(key: ChannelKey): Channel {
    const existing = channels.get(key)
    if (existing) return existing
    const context = getContext()
    const audio = new Audio()
    const source = context.createMediaElementSource(audio)
    const gain = context.createGain()
    source.connect(gain)
    gain.connect(master as GainNode)
    const channel: Channel = { audio, gain, fadeToken: 0, fadeTimer: null, fadeResolve: null }
    const sets = listeners.get(key)
    if (sets) {
      sets.ended.forEach((l) => audio.addEventListener('ended', l))
      sets.error.forEach((l) => audio.addEventListener('error', l))
    }
    channels.set(key, channel)
    return channel
  }

  function cancelFade(channel: Channel) {
    channel.fadeToken++
    if (channel.fadeTimer !== null) {
      clearTimeout(channel.fadeTimer)
      channel.fadeTimer = null
    }
    const resolve = channel.fadeResolve
    channel.fadeResolve = null
    resolve?.()
  }

  function setGain(channel: Channel, volume: number) {
    const now = (ctx as AudioContext).currentTime
    channel.gain.gain.cancelScheduledValues(now)
    channel.gain.gain.setValueAtTime(volume, now)
  }

  function mapError(error: unknown): PlayResult {
    const name = error instanceof Error || error instanceof DOMException ? error.name : ''
    if (name === 'NotAllowedError') return 'blocked'
    if (name === 'AbortError') return 'aborted'
    return 'error'
  }

  function subscribe(key: ChannelKey, event: ListenerEvent, listener: () => void): () => void {
    try {
      listenerSets(key)[event].add(listener)
      channels.get(key)?.audio.addEventListener(event, listener)
    } catch {
      // 무시
    }
    return () => {
      try {
        listeners.get(key)?.[event].delete(listener)
        channels.get(key)?.audio.removeEventListener(event, listener)
      } catch {
        // 무시
      }
    }
  }

  return {
    resume() {
      try {
        const context = getContext()
        if (context.state !== 'running') void context.resume().catch(noop)
      } catch {
        // 소리 실패는 타이머에 영향을 주지 않는다
      }
    },

    setMasterVolume(volume) {
      try {
        masterVolume = volume
        if (master && ctx) {
          const now = ctx.currentTime
          master.gain.cancelScheduledValues(now)
          master.gain.setValueAtTime(volume, now)
        }
      } catch {
        // 무시
      }
    },

    async play(key, src, volume, options) {
      let pending: Promise<void>
      let context: AudioContext
      let resuming: Promise<void> | null = null
      try {
        context = getContext()
        const channel = getChannel(key)
        cancelFade(channel)
        setGain(channel, volume)
        const { audio } = channel
        audio.loop = options?.loop ?? false
        if (audio.getAttribute('src') !== src) {
          audio.src = src
          audio.load()
        }
        // iOS 사용자 제스처 안에서 동기로 호출해야 한다
        pending = audio.play()
        if (context.state !== 'running') resuming = context.resume().catch(noop)
      } catch (error) {
        return mapError(error)
      }
      try {
        await pending
      } catch (error) {
        return mapError(error)
      }
      try {
        // 컨텍스트가 멈춰 있으면 audio.play()가 성공해도 소리가 나지 않는다
        if (isRunning(context)) return 'ok'
        await settleWithin(resuming ?? context.resume(), RESUME_WAIT_MS)
        return isRunning(context) ? 'ok' : 'blocked'
      } catch {
        return 'blocked'
      }
    },

    setVolume(key, volume) {
      try {
        const channel = channels.get(key)
        if (!channel || !ctx) return
        setGain(channel, volume)
      } catch {
        // 무시
      }
    },

    async fadeOutAndPause(key, fadeMs) {
      try {
        const channel = channels.get(key)
        if (!channel || !ctx) return
        cancelFade(channel)
        const now = ctx.currentTime
        const g = channel.gain.gain
        const startValue = g.value
        g.cancelScheduledValues(now)
        g.setValueAtTime(startValue, now)
        g.linearRampToValueAtTime(0, now + fadeMs / 1000)
        await new Promise<void>((resolve) => {
          channel.fadeResolve = resolve
          channel.fadeTimer = setTimeout(() => {
            channel.fadeTimer = null
            channel.fadeResolve = null
            try {
              channel.audio.pause()
            } catch {
              // 무시
            }
            resolve()
          }, fadeMs)
        })
      } catch {
        // 무시
      }
    },

    stop(key) {
      try {
        const channel = channels.get(key)
        if (!channel) return
        cancelFade(channel)
        channel.audio.pause()
        channel.audio.removeAttribute('src')
        channel.audio.load()
      } catch {
        // 무시
      }
    },

    onEnded: (key, listener) => subscribe(key, 'ended', listener),
    onError: (key, listener) => subscribe(key, 'error', listener),
  }
}

let singleton: SoundEngine | null = null

export function getSoundEngine(): SoundEngine {
  if (!singleton) singleton = createSoundEngine()
  return singleton
}

export function setSoundEngineForTest(engine: SoundEngine | null): void {
  singleton = engine
}
