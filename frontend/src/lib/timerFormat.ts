/**
 * 스톱워치 시간 포맷 (00:00:00)
 */
export function formatStopwatch(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

/**
 * 카운트다운 시간 포맷 (00:00)
 */
export function formatCountdown(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

/**
 * 분:초 포맷 (mm:ss)
 */
export function formatMinutesSeconds(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${String(secs).padStart(2, '0')}`
}

/**
 * 분 단위 포맷 (n분)
 */
export function formatMinutes(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  return `${mins}분`
}
