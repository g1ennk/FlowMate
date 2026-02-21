export function formatStopwatch(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  if (hours > 0) {
    return `${hours}시간 ${minutes}분 ${secs}초`
  }
  if (minutes > 0) {
    return `${minutes}분 ${secs}초`
  }
  return `${secs}초`
}

export function formatMs(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  return formatTime(seconds)
}

// 카운트다운 표시에 맞춘 포맷터 (초 단위는 올림 처리해 홈 리스트와 일치)
export function formatCountdown(ms: number): string {
  const clamped = Math.max(0, ms)
  const totalSeconds = Math.ceil(clamped / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}
