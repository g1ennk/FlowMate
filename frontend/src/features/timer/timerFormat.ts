export function formatStopwatch(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

// 카운트다운 표시에 맞춘 포맷터 (초 단위는 올림 처리해 홈 리스트와 일치)
export function formatCountdown(ms: number): string {
  const clamped = Math.max(0, ms)
  const totalSeconds = Math.ceil(clamped / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}
