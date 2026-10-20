export const MINUTE_MS = 60_000

export function formatDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** 멈춘 기록: "45초", "25분", "1시간 15분". 초는 1분 미만일 때만 쓴다 */
export function formatStoppedTime(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  if (seconds > 0 && seconds < 60) return `${seconds}초`
  const totalMinutes = Math.floor(seconds / 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes}분`
  return minutes === 0 ? `${hours}시간` : `${hours}시간 ${minutes}분`
}

function formatClock(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

const PHASE_WORD = { focus: '집중', break: '휴식' } as const

/** 실행 중 카운트: 단계 이름을 앞에 붙인다("집중 12:30", "휴식 5:00") */
export function formatRunningTime(phase: 'focus' | 'break', totalSeconds: number) {
  return `${PHASE_WORD[phase]} ${formatClock(totalSeconds)}`
}

/** 일시정지한 시계: "집중 일시정지 · 12:30". 타이머 화면처럼 멈춘 시계를 보여 주는 곳(탭 제목)에서 쓴다 */
export function formatPausedClock(phase: 'focus' | 'break', totalSeconds: number) {
  return `${PHASE_WORD[phase]} 일시정지 · ${formatClock(totalSeconds)}`
}

// 저장된 "H:mm"/"HH:mm" 시각을 "HH:mm"으로 맞춘다. 모양이 다르면 그대로 둔다
function padClock(value: string) {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/)
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : value.trim()
}

/** 미니 데이 구간: "06:00–12:00". 계획, 설정, 미니 데이 시트가 모두 이 한 형식을 쓴다(그날의 끝은 "24:00"). 둘 중 하나가 비면 "" */
export function formatTimeRange(start: string, end: string) {
  if (!start.trim() || !end.trim()) return ''
  return `${padClock(start)}–${padClock(end)}`
}

/** 미니 데이 시각 하나: "06:00" */
export function formatClockTime(value: string) {
  return padClock(value)
}

/** "10월 19일". 오늘과 같은 해면 연도를 뺀다 */
export function formatDateLabel(date: Date, today: Date = new Date()) {
  const md = `${date.getMonth() + 1}월 ${date.getDate()}일`
  return date.getFullYear() === today.getFullYear() ? md : `${date.getFullYear()}년 ${md}`
}

/** "10월 19일 – 25일". 같은 달이면 끝 날짜의 달을 빼고, 오늘과 다른 해에는 연도를 붙인다. 두 해에 걸치면 끝에도 붙인다 */
export function formatDateRangeLabel(start: Date, end: Date, today: Date = new Date()) {
  const startLabel = formatDateLabel(start, today)
  const sameYear = start.getFullYear() === end.getFullYear()
  const sameMonth = sameYear && start.getMonth() === end.getMonth()
  const endLabel = sameMonth
    ? `${end.getDate()}일`
    : sameYear
      ? `${end.getMonth() + 1}월 ${end.getDate()}일`
      : `${end.getFullYear()}년 ${end.getMonth() + 1}월 ${end.getDate()}일`
  return `${startLabel} – ${endLabel}`
}

/** "10월". 오늘과 같은 해면 연도를 뺀다 */
export function formatMonthLabel(date: Date, today: Date = new Date()) {
  const month = `${date.getMonth() + 1}월`
  return date.getFullYear() === today.getFullYear() ? month : `${date.getFullYear()}년 ${month}`
}

const WEEKDAY_NAMES = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일']

/** "10월 19일 월요일". 계획 화면 제목. 오늘과 같은 해면 연도를 뺀다 */
export function formatDateWithWeekday(date: Date, today: Date = new Date()) {
  return `${formatDateLabel(date, today)} ${WEEKDAY_NAMES[date.getDay()]}`
}

/** 오늘과 며칠 떨어졌는지: "어제", "내일", "3일 전", "5일 후". 오늘이거나 다른 해면 null(제목에 연도가 이미 있다) */
export function formatRelativeDayLabel(date: Date, today: Date = new Date()) {
  if (date.getFullYear() !== today.getFullYear()) return null
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  // 서머타임처럼 하루가 24시간이 아닌 날이 끼어도 하루 단위로 세도록 반올림한다
  const diff = Math.round((startOf(date) - startOf(today)) / 86_400_000)
  if (diff === 0) return null
  if (diff === -1) return '어제'
  if (diff === 1) return '내일'
  return diff < 0 ? `${-diff}일 전` : `${diff}일 후`
}
