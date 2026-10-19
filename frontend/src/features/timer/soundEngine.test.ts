import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  FADE_PAUSE_MS,
  FADE_PHASE_END_MS,
  RESUME_WAIT_MS,
  createSoundEngine,
  getSoundEngine,
  setSoundEngineForTest,
} from './soundEngine'

type GainMock = {
  connect: ReturnType<typeof vi.fn>
  gain: {
    value: number
    setValueAtTime: ReturnType<typeof vi.fn>
    cancelScheduledValues: ReturnType<typeof vi.fn>
    linearRampToValueAtTime: ReturnType<typeof vi.fn>
  }
}
type CtxMock = {
  state: string
  currentTime: number
  resume: ReturnType<typeof vi.fn>
  createMediaElementSource: ReturnType<typeof vi.fn>
  createGain: () => GainMock
}

const contexts: CtxMock[] = []
const gains: GainMock[] = []

function installRecordingContext() {
  const Base = window.AudioContext as unknown as new () => CtxMock
  class Recording extends Base {
    constructor() {
      super()
      const original = this.createGain.bind(this)
      this.createGain = () => {
        const g = original()
        gains.push(g)
        return g
      }
      contexts.push(this)
    }
  }
  vi.stubGlobal('AudioContext', Recording)
}

const ctx = () => contexts[contexts.length - 1]
const lastGain = () => gains[gains.length - 1]
const playMock = () => vi.mocked(HTMLMediaElement.prototype.play)
const pauseMock = () => vi.mocked(HTMLMediaElement.prototype.pause)
const loadMock = () => vi.mocked(HTMLMediaElement.prototype.load)

describe('soundEngine', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    contexts.length = 0
    gains.length = 0
    installRecordingContext()
  })
  afterEach(() => {
    vi.useRealTimers()
    setSoundEngineForTest(null)
  })

  it('creates one audio element per channel and reuses it', async () => {
    const audioSpy = vi.spyOn(window, 'Audio')
    const engine = createSoundEngine()
    await engine.play('music', '/a.mp3', 0.8)
    await engine.play('music', '/b.mp3', 0.8)
    await engine.play('ambient:rain', '/r.mp3', 0.5, { loop: true })
    expect(audioSpy).toHaveBeenCalledTimes(2)
  })

  it('connects each element to a media source only once', async () => {
    const engine = createSoundEngine()
    await engine.play('music', '/a.mp3', 1)
    await engine.play('music', '/a.mp3', 1)
    await engine.play('music', '/b.mp3', 1)
    expect(ctx().createMediaElementSource).toHaveBeenCalledTimes(1)
  })

  it('sets src only when it changes and applies loop option', async () => {
    const audioSpy = vi.spyOn(window, 'Audio')
    const engine = createSoundEngine()
    await engine.play('ambient:rain', '/r.mp3', 0.5, { loop: true })
    const el = audioSpy.mock.results[0].value as HTMLAudioElement
    expect(el.loop).toBe(true)
    expect(loadMock()).toHaveBeenCalledTimes(1)
    await engine.play('ambient:rain', '/r.mp3', 0.5, { loop: true })
    expect(loadMock()).toHaveBeenCalledTimes(1)
    await engine.play('ambient:rain', '/r2.mp3', 0.5, { loop: true })
    expect(loadMock()).toHaveBeenCalledTimes(2)
  })

  it('calls audio.play() synchronously before awaiting anything', () => {
    const engine = createSoundEngine()
    void engine.play('music', '/a.mp3', 1)
    expect(playMock()).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['NotAllowedError', 'blocked'],
    ['AbortError', 'aborted'],
    ['NotSupportedError', 'error'],
  ])('maps %s to %s', async (name, expected) => {
    playMock().mockRejectedValueOnce(new DOMException('x', name))
    expect(await createSoundEngine().play('music', '/a.mp3', 1)).toBe(expected)
  })

  it('resumes a suspended context on every play', async () => {
    const engine = createSoundEngine()
    await engine.play('music', '/a.mp3', 1)
    expect(ctx().resume).not.toHaveBeenCalled()
    ctx().state = 'suspended'
    await engine.play('music', '/a.mp3', 1)
    expect(ctx().resume).toHaveBeenCalledTimes(1)
  })

  it('reports blocked when the context stays suspended after play resolves', async () => {
    const engine = createSoundEngine()
    engine.resume()
    ctx().state = 'suspended'
    ctx().resume.mockImplementation(async () => {})
    const result = engine.play('music', '/a.mp3', 1)
    expect(playMock()).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(RESUME_WAIT_MS)
    expect(await result).toBe('blocked')
  })

  it('reports blocked when resume rejects', async () => {
    const engine = createSoundEngine()
    engine.resume()
    ctx().state = 'interrupted'
    ctx().resume.mockRejectedValue(new Error('nope'))
    const result = engine.play('music', '/a.mp3', 1)
    await vi.advanceTimersByTimeAsync(RESUME_WAIT_MS)
    expect(await result).toBe('blocked')
  })

  it('reports ok when resume brings the context back within the wait', async () => {
    const engine = createSoundEngine()
    engine.resume()
    const context = ctx()
    context.state = 'suspended'
    context.resume.mockImplementation(
      () => new Promise<void>((resolve) => setTimeout(() => {
        context.state = 'running'
        resolve()
      }, RESUME_WAIT_MS / 2)),
    )
    const result = engine.play('music', '/a.mp3', 1)
    await vi.advanceTimersByTimeAsync(RESUME_WAIT_MS / 2)
    expect(await result).toBe('ok')
  })

  it('fades from the current value: cancel → setValueAtTime → ramp, then pauses after fadeMs', async () => {
    const engine = createSoundEngine()
    await engine.play('music', '/a.mp3', 1)
    const g = lastGain().gain
    g.cancelScheduledValues.mockClear()
    g.setValueAtTime.mockClear()
    g.value = 0.7
    const done = engine.fadeOutAndPause('music', FADE_PHASE_END_MS)
    expect(g.setValueAtTime).toHaveBeenCalledWith(0.7, ctx().currentTime)
    expect(g.cancelScheduledValues).toHaveBeenCalled()
    expect(g.setValueAtTime.mock.invocationCallOrder[0]).toBeLessThan(
      g.linearRampToValueAtTime.mock.invocationCallOrder[0],
    )
    expect(g.linearRampToValueAtTime).toHaveBeenCalledWith(0, ctx().currentTime + 3)
    expect(pauseMock()).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(FADE_PHASE_END_MS)
    await done
    expect(pauseMock()).toHaveBeenCalledTimes(1)
  })

  it('cancels a pending fade when play is called again', async () => {
    const engine = createSoundEngine()
    await engine.play('music', '/a.mp3', 1)
    void engine.fadeOutAndPause('music', FADE_PAUSE_MS)
    await engine.play('music', '/a.mp3', 1)
    await vi.advanceTimersByTimeAsync(FADE_PAUSE_MS)
    expect(pauseMock()).not.toHaveBeenCalled()
  })

  it('settles a fade cancelled by play() without pausing', async () => {
    const engine = createSoundEngine()
    await engine.play('music', '/a.mp3', 1)
    const done = engine.fadeOutAndPause('music', FADE_PHASE_END_MS)
    await engine.play('music', '/a.mp3', 1)
    await expect(done).resolves.toBeUndefined()
    await vi.advanceTimersByTimeAsync(FADE_PHASE_END_MS)
    expect(pauseMock()).not.toHaveBeenCalled()
  })

  it('settles a fade cancelled by stop() and by a later fade', async () => {
    const engine = createSoundEngine()
    await engine.play('music', '/a.mp3', 1)
    const first = engine.fadeOutAndPause('music', FADE_PHASE_END_MS)
    engine.stop('music')
    await expect(first).resolves.toBeUndefined()
    expect(pauseMock()).toHaveBeenCalledTimes(1)
    const second = engine.fadeOutAndPause('music', FADE_PHASE_END_MS)
    const third = engine.fadeOutAndPause('music', FADE_PAUSE_MS)
    await expect(second).resolves.toBeUndefined()
    await vi.advanceTimersByTimeAsync(FADE_PAUSE_MS)
    await expect(third).resolves.toBeUndefined()
    expect(pauseMock()).toHaveBeenCalledTimes(2)
  })

  it('onEnded does not create AudioContext or Audio, and fires after play creates the channel', async () => {
    const audioSpy = vi.spyOn(window, 'Audio')
    const engine = createSoundEngine()
    const fn = vi.fn()
    const off = engine.onEnded('music', fn)
    expect(contexts).toHaveLength(0)
    expect(audioSpy).not.toHaveBeenCalled()
    await engine.play('music', '/a.mp3', 1)
    const el = audioSpy.mock.results[0].value as HTMLAudioElement
    el.dispatchEvent(new Event('ended'))
    expect(fn).toHaveBeenCalledTimes(1)
    off()
    el.dispatchEvent(new Event('ended'))
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('setVolume cancels scheduled values then sets the value', async () => {
    const engine = createSoundEngine()
    await engine.play('music', '/a.mp3', 1)
    const g = lastGain().gain
    g.cancelScheduledValues.mockClear()
    g.setValueAtTime.mockClear()
    engine.setVolume('music', 0.3)
    expect(g.cancelScheduledValues).toHaveBeenCalled()
    expect(g.setValueAtTime).toHaveBeenCalledWith(0.3, ctx().currentTime)
  })

  it('stop pauses immediately and clears src', async () => {
    const audioSpy = vi.spyOn(window, 'Audio')
    const engine = createSoundEngine()
    await engine.play('music', '/a.mp3', 1)
    const el = audioSpy.mock.results[0].value as HTMLAudioElement
    engine.stop('music')
    expect(pauseMock()).toHaveBeenCalledTimes(1)
    expect(el.getAttribute('src') ?? '').toBe('')
  })

  it('onEnded / onError subscribe to the channel element and return unsubscribe', async () => {
    const audioSpy = vi.spyOn(window, 'Audio')
    const engine = createSoundEngine()
    const ended = vi.fn()
    const errored = vi.fn()
    const offEnded = engine.onEnded('music', ended)
    const offError = engine.onError('music', errored)
    await engine.play('music', '/a.mp3', 1)
    const el = audioSpy.mock.results[0].value as HTMLAudioElement
    el.dispatchEvent(new Event('ended'))
    el.dispatchEvent(new Event('error'))
    expect(ended).toHaveBeenCalledTimes(1)
    expect(errored).toHaveBeenCalledTimes(1)
    offEnded()
    offError()
    el.dispatchEvent(new Event('ended'))
    el.dispatchEvent(new Event('error'))
    expect(ended).toHaveBeenCalledTimes(1)
    expect(errored).toHaveBeenCalledTimes(1)
  })

  it('never throws when AudioContext is unavailable', async () => {
    vi.stubGlobal(
      'AudioContext',
      class {
        constructor() {
          throw new Error('nope')
        }
      },
    )
    const engine = createSoundEngine()
    expect(() => engine.resume()).not.toThrow()
    expect(await engine.play('music', '/a.mp3', 1)).toBe('error')
    expect(() => engine.setVolume('music', 0.5)).not.toThrow()
    expect(() => engine.setMasterVolume(0.5)).not.toThrow()
    expect(() => engine.stop('music')).not.toThrow()
    await expect(engine.fadeOutAndPause('music', 100)).resolves.toBeUndefined()
  })

  it('getSoundEngine is a singleton that can be replaced for tests', () => {
    const a = getSoundEngine()
    expect(getSoundEngine()).toBe(a)
    const fake = createSoundEngine()
    setSoundEngineForTest(fake)
    expect(getSoundEngine()).toBe(fake)
  })
})
